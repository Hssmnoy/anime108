const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const { execSync } = require("child_process");

const BASE = "https://www.anime108.com";

const CONFIG = {
  categories: [
    "/อนิเมะ-2026/",
    "/อนิเมะ-2025/",
    "/อนิเมะพากย์ไทย/",
     "/อนิเมะซับไทย/",
     "/อนิเมะจบแล้ว/",
     "/อนิเมะเก่า/",
  ],
  delay: 500,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 🔥 resume
function loadOld(fileName) {
  if (fs.existsSync(fileName)) {
    try {
      return JSON.parse(fs.readFileSync(fileName));
    } catch {
      return [];
    }
  }
  return [];
}

// 🔥 commit
function gitCommit(msg) {
  try {
    execSync("git config user.name 'bot'");
    execSync("git config user.email 'bot@users.noreply.github.com'");
    execSync("git add .");
    execSync(`git commit -m "${msg}" || echo "no changes"`);
    execSync("git push");
  } catch {
    console.log("❌ commit fail");
  }
}

// 🔥 แปลงชื่อไฟล์
function getFileName(category) {
  return category
    .replace(/\//g, "")
    .replace(/\s+/g, "-") + ".json";
}

// STEP 1
async function getList(url) {
  const { data } = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const $ = cheerio.load(data);
  const list = [];

  $("a[href*='anime108.com']").each((i, el) => {
    const link = $(el).attr("href");
    const title = $(el).find(".p2").text().trim();

    const imgEl = $(el).find("img");
    let image =
      imgEl.attr("data-src") ||
      imgEl.attr("data-lazy-src") ||
      imgEl.attr("data-original") ||
      imgEl.attr("src");

    if (image && image.startsWith("data:image")) image = null;

    if (title && link && link.includes(BASE)) {
      list.push({ title, link, image });
    }
  });

  return [...new Map(list.map(i => [i.link, i])).values()];
}

// STEP 2
async function getEpisodes(url) {
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  const episodes = [];

  $("option").each((i, el) => {
    const value = $(el).attr("value");
    const name = $(el).text().trim();

    if (value && name.includes("ตอน")) {
      episodes.push({
        name,
        link: BASE + value,
      });
    }
  });

  return [...new Map(episodes.map(e => [e.link, e])).values()];
}

// STEP 3
async function getMeta(url) {
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  const btn = $(".halim-btn.active").length
    ? $(".halim-btn.active")
    : $(".halim-btn").first();

  return {
    postId: btn.attr("data-post-id"),
    server: btn.attr("data-server"),
  };
}

// STEP 4
async function getPlayers(meta, episode) {
  const results = [];
  const LANGS = ["Sound Track", "Thai"];

  for (const lang of LANGS) {
    try {
      const params = new URLSearchParams();
      params.append("action", "halim_ajax_player");
      params.append("episode", episode);
      params.append("server", meta.server);
      params.append("postid", meta.postId);
      params.append("lang", lang);
      params.append("title", "");

      const res = await axios.post(`${BASE}/api/get.php`, params);

      const match = res.data.match(/src="([^"]+)"/);
      if (!match) continue;

      const playerUrl = match[1];
      if (!playerUrl.includes("index_th.php")) continue;

      if (results.some(r => r.url === playerUrl)) continue;

      results.push({
        lang: lang === "Thai" ? "dub" : "sub",
        url: playerUrl,
      });

    } catch {}
  }

  return results;
}

// 🚀 MAIN
(async () => {
  console.log("🚀 Start...\n");

  for (const category of CONFIG.categories) {
    console.log("\n📂 หมวด:", category);

    const fileName = getFileName(category);

let results = loadOld(fileName);
let count = results.length;

    let page = 1;

    while (true) {
      const url =
        page === 1
          ? `${BASE}${category}`
          : `${BASE}${category}page/${page}/`;

      console.log("📄 Page:", url);

      const list = await getList(url);

      if (!list.length) {
        console.log("🛑 หมวดนี้จบ");
        break;
      }

      for (const anime of list) {

let oldAnime = results.find(a => a.link === anime.link);

if (oldAnime) {
  console.log("🔄 มีอยู่แล้ว → เช็คตอนใหม่");

  const epsRaw = await getEpisodes(anime.link);

  for (const ep of epsRaw) {
    if (oldAnime.episodes.some(e => e.link === ep.link)) {
      continue; // มีตอนนี้แล้ว
    }

    console.log("🆕 ตอนใหม่:", ep.name);

    const meta = await getMeta(ep.link);
    if (!meta.postId || !meta.server) continue;

    const epNumMatch = ep.link.match(/ep-(\d+)/);
    if (!epNumMatch) continue;

    const players = await getPlayers(meta, epNumMatch[1]);
    if (!players.length) continue;

    oldAnime.episodes.push({
      name: ep.name,
      link: ep.link,
      players,
    });

    await sleep(CONFIG.delay);
  }

oldAnime.hasDub = oldAnime.episodes.some(ep =>
    ep.players.some(p => p.lang === "dub")
  );

  continue; // 🔥 สำคัญ: ไปเรื่องถัดไป
}


        console.log("\n📺", anime.title);

        const epsRaw = await getEpisodes(anime.link);
        const episodes = [];

        for (const ep of epsRaw) {
          const meta = await getMeta(ep.link);
          if (!meta.postId || !meta.server) continue;

          const epNumMatch = ep.link.match(/ep-(\d+)/);
          if (!epNumMatch) continue;

          const players = await getPlayers(meta, epNumMatch[1]);
          if (!players.length) continue;

          episodes.push({
            name: ep.name,
            link: ep.link,
            players,
          });

          await sleep(CONFIG.delay);
        }

        const hasDub = episodes.some(ep =>
          ep.players.some(p => p.lang === "dub")
        );

        results.push({
          ...anime,
          hasDub,
          episodes,
        });

        count++;

        // 🔥 commit ทุก 10 เรื่อง
if (count % 10 === 0) {
  fs.writeFileSync(
    fileName,
    JSON.stringify(results, null, 2)
  );

  console.log(`💾 Commit (${count})`);
  gitCommit(`update ${fileName} (${count})`);
}

        // 🔥 auto save ทุก 30 เรื่อง
        if (count % 30 === 0) {
          fs.writeFileSync(
            fileName,
            JSON.stringify(results, null, 2)
          );
          console.log(`💾 Saved ${fileName} (${count})`);
        }
      }

      page++;
    }

    // 💾 save หมวดสุดท้าย
    fs.writeFileSync(
      fileName,
      JSON.stringify(results, null, 2)
    );
     gitCommit(`final ${fileName}`);
    console.log(`\n✅ หมวด ${category} เสร็จ → ${fileName}`);
  }
})();
