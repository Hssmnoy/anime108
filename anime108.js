const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const { execSync } = require("child_process");
const DOMAIN = "https://www.anime108.com";
const BASE = "https://www.anime108.com";
const WISEPLAY_DIR = "wiseplay";
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

    if (title && link) {
  const fixedLink = link.startsWith("http")
    ? link
    : BASE + link;

  list.push({ title, link: fixedLink, image });
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
  link: value.startsWith("http")
    ? value
    : BASE + value,
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

function buildWiseplayJSON(categoryName, data) {
  if (!fs.existsSync("wiseplay")) {
  fs.mkdirSync("wiseplay");
}
    const output = {
    name: categoryName.replace(/\//g, ""),
    author: `อัพเดตล่าสุด ${new Date().toLocaleDateString("th-TH")}`,
    image: "https://www.anime108.com/wp-content/uploads/2024/04/anime108-e1713838624780.png",
    url: BASE,
    groups: []
  };

  for (const anime of data) {
    const group = {
      name: anime.title,
      image: anime.image || "",
      stations: []
    };

    if (!anime.episodes) continue;

    for (const ep of anime.episodes) {
      if (!ep.players) continue;

      for (const p of ep.players) {
        group.stations.push({
          name: `${ep.name} (${p.lang})`,
          image: anime.image || "",
          url: p.url,
          referer: BASE
        });
      }
    }

    if (group.stations.length > 0) {
      output.groups.push(group);
    }
  }

  const fileName =
    "wiseplay/" +
    categoryName.replace(/\//g, "").replace(/\s+/g, "-") +
    ".json";

  fs.writeFileSync(fileName, JSON.stringify(output, null, 2));
  console.log("📺 Wiseplay created:", fileName);
}

function generateIndex(categories) {
  const baseRaw =
    "https://raw.githubusercontent.com/Hssmnoy/anime108/main/wiseplay/";

  const index = {
    name: "Anime108",
    author: `อัพเดตล่าสุด ${new Date().toLocaleDateString("th-TH")}`,
    image: "https://www.anime108.com/wp-content/uploads/2024/04/anime108-e1713838624780.png",
    url: BASE,
    groups: []
  };

  for (const cat of categories) {
    const file = cat
      .replace(/\//g, "")
      .replace(/\s+/g, "-") + ".json";

    index.groups.push({
      name: cat.replace(/\//g, ""),
      image: "https://www.anime108.com/wp-content/uploads/2024/04/anime108-e1713838624780.png",
      url: baseRaw + file
    });
  }

  fs.writeFileSync(
    "wiseplay/index.json",
    JSON.stringify(index, null, 2)
  );

  console.log("📦 index.json created");
}

// 🚀 MAIN
(async () => {
  console.log("🚀 Start...\n");
  
  if (!fs.existsSync("wiseplay")) {
  fs.mkdirSync("wiseplay");
}
  for (const category of CONFIG.categories) {
    console.log("\n📂 หมวด:", category);

    const fileName = getFileName(category);

let results = loadOld(fileName);
let count = results.length;

    let page = 1;
    let noUpdatePage = 0;
    const updatedSet = new Set();
    
while (page <= 3) {
  
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

   let hasUpdateInPage = false;
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

    oldAnime.episodes.unshift({
  name: ep.name,
  link: ep.link,
  players,
});
updatedSet.add(oldAnime.link);

hasUpdateInPage = true;

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

       const newAnime = {
  ...anime,
  hasDub,
  episodes,
};

results.unshift(newAnime);
updatedSet.add(newAnime.link);
hasUpdateInPage = true;
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
if (!hasUpdateInPage) {
  noUpdatePage++;
  console.log(`❌ ไม่มีอะไรใหม่ (${noUpdatePage}/2)`);

  if (noUpdatePage >= 2) {
    console.log("🛑 หยุดหมวด (ไม่มีอะไรใหม่)");
    break;
  }
} else {
  noUpdatePage = 0;
}
  results.sort((a, b) => {
  const aUpdated = updatedSet.has(a.link);
  const bUpdated = updatedSet.has(b.link);

  if (aUpdated && !bUpdated) return -1;
  if (!aUpdated && bUpdated) return 1;
  return 0;
});
      page++;
    }

    // 💾 save หมวดสุดท้าย
    fs.writeFileSync(
      fileName,
      JSON.stringify(results, null, 2)
    );
     gitCommit(`final ${fileName}`);
    console.log(`\n✅ หมวด ${category} เสร็จ → ${fileName}`);
    buildWiseplayJSON(category, results);
    gitCommit(`wiseplay ${fileName}`);
  }
  generateIndex(CONFIG.categories);
})();
