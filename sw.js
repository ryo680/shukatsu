// 画面のファイルを端末に控えておき、電波が弱いときも開けるようにする。
// 記録の読み書き（Firebase の通信）には手を出さない。
const CACHE = "shukatsu-v4";
const PREFIX = "shukatsu-"; // 同じ github.io の家計簿・家事メモの控えは消さない
const FONT_CACHE = "ud-font-v1";
const WAIT_MS = 3000; // ネットの返事をこれ以上待たずに、控えで開く
const FILES = [
  "./", "./index.html", "./firebase.js", "./config.js", "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"
];
self.addEventListener("install", (e) => {
  // cache: "reload"：ブラウザの一時保存を通さず、上がったばかりのファイルを取る
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 文字の形（UDフォント）：一度取ったものは端末の控えを使う
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(FONT_CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) c.put(req, res.clone());
      return res;
    }))));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // cache: "no-cache"：毎回 GitHub に「変わった？」と確かめる（変わっていなければ中身は送られてこない）
  const net = fetch(req, { cache: "no-cache" }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  });
  e.waitUntil(net.then(() => {}, () => {}));

  if (req.mode !== "navigate") {
    // 画面の部品（firebase.js など）：控えがあればすぐ使い、裏で新しいものに入れ替えておく
    e.respondWith(caches.match(req).then((hit) => hit || net));
    return;
  }
  // 画面そのもの：まずネットに取りに行き、3秒で返事がなければ控えで開く
  e.respondWith((async () => {
    const cached = (await caches.match(req)) || (await caches.match("./index.html"));
    if (!cached) return net.catch(() => caches.match("./index.html"));
    if (self.navigator && self.navigator.onLine === false) return cached; // 圏外なら待たない
    const quick = await Promise.race([
      net.then((r) => r, () => null),
      new Promise((r) => setTimeout(() => r(null), WAIT_MS))
    ]);
    return quick || cached;
  })());
});
