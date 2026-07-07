import React, { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   Workplace English Coach — Deliberate Practice Engine (M2)
   Lines: decode (reading), register (formality), build (speaking-as-text)
   ============================================================ */

const C = {
  bg: "#EFF2F6",
  surface: "#FFFFFF",
  ink: "#101D33",
  sub: "#5A6B85",
  line: "#D8DEE8",
  accent: "#2E5BFF",
  accentSoft: "#E4EAFF",
  good: "#0E9F6E",
  goodSoft: "#E2F5EE",
  bad: "#D64545",
  badSoft: "#FBE9E9",
  amber: "#C77D1F",
  amberSoft: "#FAF0DF",
};

const FONT = `@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;900&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap');`;
const disp = { fontFamily: "'Archivo', system-ui, sans-serif" };
const body = { fontFamily: "'Inter', system-ui, sans-serif" };
const mono = { fontFamily: "'JetBrains Mono', monospace" };

const LINES = {
  decode: { name: "Decode", goal: "Read business material in one pass", color: "#2E5BFF" },
  register: { name: "Register", goal: "Write correctly, at the right formality", color: "#7A3EF0" },
  build: { name: "Build", goal: "Form full sentences under time pressure", color: "#0E9F6E" },
};
const LINE_KEYS = ["decode", "register", "build"];
const ERROR_TAGS = ["grammar", "tense", "article", "collocation", "register", "word-choice", "chinglish", "structure-misread"];

const LEVEL_DESC = {
  decode: [
    "≤20-word single sentence; pick the core (S-V-O) in 12s",
    "~30-word sentence with nominalization/passive; core in 12s",
    "40+-word multi-clause sentence; core in 18s",
    "Short slide paragraph (3–5 sentences); one-line gist in 35s",
    "Slide paragraph with jargon & acronyms; English gist in 35s",
  ],
  register: [
    "Judge a sentence's register (casual / neutral / formal)",
    "Rewrite a casual sentence into formal, score ≥ 70",
    "Fix sentences containing typical Chinglish / collocation errors",
    "From a Chinese point + scenario, write register-appropriate English in 90s",
    "Same as L4, passing on the first attempt",
  ],
  build: [
    "Chinese meaning + pattern hint → write the English, no time limit",
    "No pattern hint, 40s limit",
    "25s limit, must use the given workplace pattern",
    "Three linked sentences (raise issue → suggest → ask), 90s",
    "Same as L4 under near-real-time pressure (50s)",
  ],
};

/* ---------------- storage ---------------- */
/* 解码线结构课程表：难度不只由句长决定，核心是这些结构的识别。
   lv = [最低等级, 最高等级]，结构只会出现在对应等级区间的题目里 */
const STRUCTURES = {
  prep_chain: { zh: "介词短语连环修饰", en: "chained prepositional phrases stacking modifiers after a noun", lv: [1, 2] },
  parallel: { zh: "并列结构", en: "parallel structure joining multiple verbs or objects with and/or", lv: [1, 2] },
  nominalization: { zh: "名词化（动作变名词）", en: "nominalization — actions packed into abstract nouns (e.g. 'the implementation of the rollout')", lv: [2, 3] },
  passive: { zh: "被动语态（隐藏施动者）", en: "passive voice with the agent omitted", lv: [2, 3] },
  participle: { zh: "分词短语开头", en: "a participle phrase opening the sentence before the real subject appears", lv: [2, 3] },
  long_subject: { zh: "超长主语拖延动词", en: "a long noun-phrase subject that delays the main verb", lv: [3, 4] },
  insertion: { zh: "插入语打断主干", en: "a mid-sentence insertion set off by commas or dashes interrupting the core", lv: [3, 4] },
  relative_stack: { zh: "多层定语从句", en: "stacked relative clauses (which/that/who) modifying nested nouns", lv: [3, 5] },
  hedging: { zh: "条件限定埋没主张", en: "conditional hedging that buries the real claim (e.g. 'subject to', 'provided that', 'to the extent that')", lv: [4, 5] },
  discourse: { zh: "转折/让步衔接词", en: "contrastive or concessive discourse markers (however, that said, while, granted) that reverse or qualify the claim mid-passage", lv: [4, 5] },
  jargon_compress: { zh: "黑话压缩名词串", en: "jargon-heavy compressed noun strings typical of slides (e.g. 'cross-functional alignment workstream kickoff')", lv: [5, 5] },
};
const STRUCT_KEYS = Object.keys(STRUCTURES);
// 内化标准：见过 ≥4 次且正确率 ≥75%
function structMastered(m) { return m && m.seen >= 4 && m.correct / m.seen >= 0.75; }

const KEY = "wec_state_v1";
const DEFAULT_STATE = {
  placementDone: false,
  levels: { decode: 1, register: 1, build: 1 },
  streaks: { decode: { c: 0, w: 0 }, register: { c: 0, w: 0 }, build: { c: 0, w: 0 } },
  errorMap: {},
  recentWrong: [],
  sessions: [],
  freeStats: { decode: [], register: [], build: [] },
  lastTexts: [],
  structMastery: {},   // 每个结构的账本：{ nominalization: { seen: 5, correct: 4 }, ... }
  lastStruct: null,    // 上一道解码题考的结构及结果，驱动"结构迁移"
  wrongBook: [],       // 错题本：完整保存每道错题的题目、答案、问题、用时（最近100条）
  expressionBook: [],  // 表达卡池：{id, weak, better, note, line, seen, used, mastered, ts}
  materials: { sentences: [], topics: [] }, // 素材池：真实工作材料提取的难句与话题
  speedLog: [],          // 流利度日志：每题 {t,line,ok,frac(用时/时限)}，自动化的金标准是"正确率不降、用时下降"
  placementHistory: [],  // 摸底历史：每次摸底/重测的 {date,levels}，保住基线
  selfChecks: [],        // 每周自评：{date,score 1-3}，系统内唯一刷不了的外部校标
  gistOk: 0,             // 主旨题累计答对数：<3 时启用脚手架（预标功能标签+时限放宽），答对3次后撤除
  examHistory: [],       // 考试成绩单：{date, lines:{decode:{lv,acc,wpm},...}} —— 独立于日常训练的水平测量
};

/* ---------------- 云同步（GitHub Gist 作为进度存储）---------------- */
const GIST_FILE = "wec-progress.json";
function getGhToken() { try { return localStorage.getItem("wec_gh_token") || ""; } catch (e) { return ""; } }
function getGistId() { try { return localStorage.getItem("wec_gist_id") || ""; } catch (e) { return ""; } }
async function ghApi(path, method = "GET", body) {
  const res = await fetch("https://api.github.com" + path, {
    method,
    headers: { Authorization: "Bearer " + getGhToken(), Accept: "application/vnd.github+json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error("gh " + res.status);
  return res.json();
}
// 找到（或新建）存进度的私密 gist；新设备靠文件名自动发现，无需手动填 id
async function cloudFindOrCreate(state) {
  const gists = await ghApi("/gists?per_page=100");
  const hit = gists.find((g) => g.files && g.files[GIST_FILE]);
  if (hit) { localStorage.setItem("wec_gist_id", hit.id); return hit.id; }
  const created = await ghApi("/gists", "POST", {
    description: "职场英语教练 - 进度云同步（自动生成，勿删）", public: false,
    files: { [GIST_FILE]: { content: JSON.stringify(state || {}) } },
  });
  localStorage.setItem("wec_gist_id", created.id);
  return created.id;
}
async function cloudPull() {
  if (!getGhToken() || !getGistId()) return null;
  const g = await ghApi("/gists/" + getGistId());
  const f = g.files && g.files[GIST_FILE];
  if (!f) return null;
  const content = f.truncated ? await (await fetch(f.raw_url)).text() : f.content; // 大文件被截断时拉原始地址
  _syncMark(true);
  return JSON.parse(content);
}
// 同步状态打点：失败不能静默——首页要能看到"上次同步时间/失败警告"
function _syncMark(ok) {
  try {
    if (ok) { localStorage.setItem("wec_last_sync", String(Date.now())); localStorage.removeItem("wec_sync_err"); }
    else localStorage.setItem("wec_sync_err", "1");
  } catch (e) {}
}
let _pushTimer = null;
function cloudPushDebounced(state) {
  if (!getGhToken() || !getGistId()) return;
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => { // 合并 2.5 秒内的连续保存，避免每题一次请求
    ghApi("/gists/" + getGistId(), "PATCH", { files: { [GIST_FILE]: { content: JSON.stringify(state) } } })
      .then(() => _syncMark(true))
      .catch(() => _syncMark(false));
  }, 2500);
}

/* ---------------- SRS 间隔复习调度（艾宾浩斯）---------------- */
// 记忆项（卡片/结构/错题）统一按扩张间隔复习：答对间隔升档，答错归零重来
const SRS_DAYS = [1, 3, 7, 16, 35];
const DAY_MS = 24 * 60 * 60 * 1000;
function srsInit() { return { ivl: 0, due: Date.now() + SRS_DAYS[0] * DAY_MS }; }
function srsAdvance(srs) {
  const ivl = Math.min(((srs && srs.ivl) || 0) + 1, SRS_DAYS.length - 1);
  return { ivl, due: Date.now() + SRS_DAYS[ivl] * DAY_MS };
}
function srsReset() { return srsInit(); }
function isDue(item) { return !item.srs || (item.srs.due || 0) <= Date.now(); } // 旧数据无 srs 视为到期

/* ---------------- 表达卡池逻辑 ---------------- */
const normPhrase = (s) => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
function cardStatus(c) { return c.mastered ? "mastered" : (c.used >= 1 ? "practiced" : "seen"); }
// 合并新卡片进卡池：按 better 短语去重，已存在的只 seen+1
function mergeCards(book, newCards, line) {
  const out = [...book];
  (newCards || []).forEach((nc) => {
    if (!nc || !nc.better) return;
    const key = normPhrase(nc.better);
    if (!key) return;
    const hit = out.find((c) => normPhrase(c.better) === key);
    if (hit) { hit.seen = (hit.seen || 0) + 1; }
    else out.push({ id: key + "_" + Date.now().toString(36), weak: nc.weak || "", better: nc.better, note: nc.note || "", line, seen: 1, used: 0, mastered: false, ts: Date.now(), srs: srsInit() });
  });
  return out.slice(-200);
}
// 选一张待复习卡片：到期的最优先（最逾期在前，含已掌握的长周期回访）；
// dueOnly 用于日常 session（没到期就不打扰）；复习入口则回退到未掌握里挑
function pickReviewCard(state, { dueOnly = false } = {}) {
  const book = state.expressionBook || [];
  const due = book.filter(isDue).sort((a, b) => (((a.srs || {}).due) || 0) - (((b.srs || {}).due) || 0));
  if (due.length) return due[0];
  if (dueOnly) return null;
  const rest = book.filter((c) => !c.mastered);
  if (!rest.length) return null;
  return [...rest].sort((a, b) => (a.used - b.used) || (b.seen - a.seen))[0];
}

async function loadState() {
  try {
    const r = await window.storage.get(KEY);
    if (r && r.value) return { ...DEFAULT_STATE, ...JSON.parse(r.value) };
  } catch (e) {}
  return { ...DEFAULT_STATE };
}
async function saveState(s) {
  try { await window.storage.set(KEY, JSON.stringify(s)); } catch (e) { console.error("save failed", e); }
}

/* ---------------- AI helpers ---------------- */
// 模型配置：出题用 reasoner（深度思考，质量最高——预取已把它的慢完全隐藏）；
// 判分/翻译用 chat（你提交后在干等，要快）。判分若仍不老实，可把 AI_MODEL_GRADE 也改 "deepseek-reasoner"
const AI_BASE = "https://api.deepseek.com/chat/completions";
const AI_MODEL_GEN = "deepseek-reasoner";
const AI_MODEL_GRADE = "deepseek-chat";

// 密钥优先级：浏览器本地保存的 > 构建时注入的（线上版不注入，首次使用时粘贴一次）
function getApiKey() {
  try { const k = localStorage.getItem("wec_api_key"); if (k && k.trim()) return k.trim(); } catch (e) {}
  return (import.meta.env.VITE_DEEPSEEK_API_KEY || "").trim();
}

async function callAI(prompt, maxRetry = 1, model = AI_MODEL_GRADE) {
  for (let i = 0; i <= maxRetry; i++) {
    try {
      const res = await fetch(AI_BASE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify({
          model,
          // reasoner 的 max_tokens 包含思考过程，必须放宽，否则答案被思考挤掉
          max_tokens: model.includes("reasoner") ? 6000 : 1200,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      if (text) return text;
    } catch (e) { if (i === maxRetry) throw e; }
  }
  throw new Error("AI call failed");
}
function parseJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  return JSON.parse(clean.slice(start, end + 1));
}

const LEARNER = `Learner: Chinese professional, IELTS 7 (writing 6.5, speaking 6). Works in English with slide decks, instant messaging (Slack/Teams), and meetings. Business contexts: product, strategy, project updates, stakeholder communication.`;

// 时限缩放系数：1 = 原版压力。若某阶段确实读不完，可临时调大（如 1.3）再逐步降回
const TIME_SCALE = 1;
function timeLimitFor(line, level, kind) {
  let t;
  if (line === "decode") t = kind === "gist" ? 35 : level >= 3 ? 18 : 12;
  else if (line === "register") t = kind === "judge" ? 15 : kind === "judge3" ? 30 : 90;
  else if (line === "build") t = [0, 0, 45, 30, 90, 60][level] || 45; // 用户体感校准：L2 45s / L3 30s / L4 90s / L5 60s；PRD原版偏紧，待内化后再收
  else t = 60;
  return t > 0 ? Math.round(t * TIME_SCALE) : t;
}

/* 为解码题挑选目标结构：
   1. 结构迁移（PRD 题型3）：上一题的结构答错了 → 换内容再考同一结构，直到攻克
   2. 否则：没见过的结构最优先，其次正确率最低的（优先打弱点） */
function pickStructure(state, level, forceStruct) {
  if (forceStruct && STRUCTURES[forceStruct]) return forceStruct; // 错题重考：指定结构
  const inRange = (k) => level >= STRUCTURES[k].lv[0] && level <= STRUCTURES[k].lv[1];
  if (state.lastStruct && !state.lastStruct.correct && inRange(state.lastStruct.key)) {
    return state.lastStruct.key; // 结构迁移：答错的结构换内容重考
  }
  const pool = STRUCT_KEYS.filter(inRange);
  const sm = state.structMastery || {};
  // SRS：到期的结构最优先（最逾期在前），已内化的靠长间隔自然回访，替代旧的随机抽查
  const due = pool.filter((k) => sm[k] && sm[k].seen && isDue(sm[k]))
    .sort((a, b) => (((sm[a].srs || {}).due) || 0) - (((sm[b].srs || {}).due) || 0));
  if (due.length) return due[0];
  const score = (k) => {
    const m = sm[k];
    if (!m || !m.seen) return -1; // 没见过 → 最优先
    return m.correct / m.seen + (structMastered(m) ? 1 : 0); // 正确率低优先；已内化的垫底
  };
  return [...pool].sort((a, b) => score(a) - score(b))[0] || null;
}

async function genQuestion(line, level, state, revengeTag, opts = {}) {
  const avoid = state.lastTexts.slice(-4).join(" | ");
  let schema = "";
  let spec = "";
  let structKey = null;
  let reviewCard = null;
  let materialId = null;
  if (line === "decode") {
    structKey = pickStructure(state, level, opts.forceStruct);
    const st = structKey ? STRUCTURES[structKey] : null;
    // 教学测量原则：控制词汇变量，让难度只来自目标结构（L5 黑话题除外）
    const vocabCtl = level < 5 ? " Keep vocabulary within common B2 business range — difficulty must come from the structure, NOT from rare words." : "";
    let structSpec = (st ? ` The sentence's difficulty MUST come primarily from this target structure: ${st.en}. Build the sentence around it.` : "") + vocabCtl;
    // 素材题（对半开）：50% 用真实素材，其中一半原句、一半同结构改编（用户选定的混合模式）
    const mat = level <= 3 && Math.random() < 0.5 ? pickMaterialSentence(state) : null;
    if (mat) {
      materialId = mat.text;
      structKey = null; // 素材题不计入结构课程表账本（结构由素材决定，非引擎指定）
      structSpec = Math.random() < 0.5
        ? ` USE EXACTLY this sentence from the learner's REAL work material as the question sentence, unchanged: "${mat.text}"`
        : ` Write a NEW sentence with the SAME syntactic structure as this sentence from the learner's real work material, but different topic and content: "${mat.text}"`;
    }
    if (level <= 3) {
      spec = `Question type "trunk". A question is a measurement instrument AND a training stimulus: it must be solvable ONLY by parsing the sentence's structure, and a wrong choice must reveal WHICH misreading happened. Build it under these principles:
THE SENTENCE (the only thing allowed to be hard):
- Realistic — could appear verbatim in a real slide, email, or doc. Level ${level}: ${LEVEL_DESC.decode[level - 1]}.
- Its entire difficulty comes from the target structure.${structSpec}
THE 4 OPTIONS (must all be trivially easy to read):
- Each is a plain-English "who does what" statement, at most 12 words, no nominalization, no chained modifiers, no ambiguity. The learner parses the sentence, never the options.
- Exactly one correct: the bare core, strictly faithful — never add an agent, cause, or fact the sentence does not state; a passive sentence with no stated agent keeps a plain agentless passive (e.g. "The approval was confirmed yesterday").
- Each of the 3 distractors embodies ONE specific misreading that the target structure plausibly invites (e.g. a modifier mistaken for the agent). Every distractor must still describe a believable business event — a distractor that sounds absurd on its own can be eliminated without parsing the sentence, which makes it worthless.
SELF-CHECK before returning: (1) does the answerIndex option commit any misreading your "why" describes? (2) can any distractor be ruled out by common sense alone, without reading the sentence? If either is true, fix it.`;
      schema = `{"kind":"trunk","sentence":"...","options":["...","...","...","..."],"answerIndex":0,"why":"1-2 sentences: how this structure misleads, plus a transferable routine for spotting the core in ANY sentence with this structure","core":{"subject":"<the grammatical subject HEAD, copied EXACTLY from the sentence (short — the head noun phrase, not its long modifiers)>","verb":"<the main verb (with auxiliaries), copied EXACTLY>","object":"<the object/complement copied EXACTLY, or null if none>"}}`;
    } else {
      spec = `Question type "gist": ${opts.genre === "email" ? "a realistic work EMAIL (3-5 sentences: greeting-free body with context, a concrete ask, and a deadline buried mid-text). The learner must summarize in one line WHAT is being asked and BY WHEN" : `a realistic slide-style paragraph (3-5 sentences${level === 5 ? ", include 1-2 business acronyms/jargon" : ""})`}.${st ? ` At least one key sentence must be built on this target structure: ${st.en}.` : ""} The learner must summarize the gist in one line${level === 5 ? " in English" : ""}.
ANATOMY: also return each sentence of the passage tagged with its discourse role — this teaches the transferable routine "tag each sentence's function, then gist = problem + core actions (+ timeline), drop details". Roles: "problem" (问题/现状), "action" (行动/措施), "result" (预期效果), "timeline" (时间/节奏), "detail" (可忽略细节). Copy each sentence EXACTLY; the passage must be exactly these sentences joined.`;
      schema = `{"kind":"gist","passage":"...","anatomy":[{"sentence":"<exact sentence>","role":"problem|action|result|timeline|detail","zh":"<≤6字中文功能标签，如 问题/行动①/预期效果/节奏>"}],"note":"what a good gist must capture (for grading, not shown to learner)"}`;
    }
  } else if (line === "register") {
    // 语域 = 符合媒介惯例，不是一味"更正式"。所有产出题按真实媒介的文体标准要求
    const mediumRules = ` The scenario must name a concrete medium, and the expected output must follow that MEDIUM's real conventions: slide bullets are concise and sentence fragments are acceptable; IM replies are brief and natural-professional; external emails use complete, formal sentences. Never demand generic textbook formality that real professionals would not use in that medium.`;
    // 草稿必须是"这个学习者"的真实弱点，不是母语者的口头语病
    const draftVoice = ` THE DRAFT MUST BE IN THE LEARNER'S VOICE — a Chinese professional's typical weak draft: tone-intent mismatch, Chinglish or direct-translation phrasing, over-politeness, vagueness, minor article/tense slips. NEVER use native-speaker spoken fillers ("like,", "kinda", "y'know", "gonna") — this learner would never type those.`;
    // 核心理念：语域 = 语气与意图匹配。犹豫/软化不是错误，错位才是错误
    const intentRules = ` EVERY rewrite question MUST state the learner's communicative INTENT in the "intent" field (Chinese, e.g. "你已拍板，通知团队" / "你有初步想法，想听大家意见" / "你不同意上级的方案，需要委婉表达" / "请求同事帮忙" / "传达坏消息" / "催进度"). ROTATE across these intents — do not always pick decisive ones. THE GOLDEN RULE: hedging is a TOOL, not an error. If the intent is tentative (seeking input, soft disagreement), the polished version MUST KEEP well-formed softeners (What if we... / One option could be... / I'm leaning toward X, curious what you think) — stripping them would be WRONG. The only tone error is MISMATCH between tone and intent: sounding tentative when announcing a decision, or sounding decided when consulting. The draft's flaw should often be exactly such a mismatch.`;
    if (level === 1) {
      // 一题三判：单次语气判断信息密度太低，打包三句算一题（全对才算对）
      spec = `Question type "judge3": THREE short business-context sentences, each with a clearly identifiable register (casual / neutral / formal — the three sentences should cover different registers, in random order). Each sentence must be something a real person could genuinely write at work — no cartoonish slang.`;
      schema = `{"kind":"judge3","options":["Casual","Neutral","Formal"],"items":[{"sentence":"...","answerIndex":0,"why":"which words signal it (one short sentence)"},{"sentence":"...","answerIndex":1,"why":"..."},{"sentence":"...","answerIndex":2,"why":"..."}]}`;
    } else if (level === 3) {
      spec = `Question type "rewrite": a realistic FIRST DRAFT containing 1-2 typical Chinese-speaker errors (Chinglish phrasing, wrong collocation, article/tense slip) — the kind of sentence the learner might actually type. Learner polishes it into what they would actually send.${draftVoice}${intentRules}${mediumRules}`;
      schema = `{"kind":"rewrite","sentence":"...","intent":"<中文：你的沟通意图>","scenario":"...","note":"the errors planted + the intent + the medium's conventions (for grading)"}`;
    } else if (level >= 4) {
      spec = `Question type "rewrite": give a Chinese bullet point (one idea) plus a scenario (slide title/body, IM to a senior stakeholder, or external email). Learner writes medium-appropriate English.${intentRules}${mediumRules}`;
      schema = `{"kind":"rewrite","sentence":"<the Chinese point>","intent":"<中文：你的沟通意图>","scenario":"...","note":"key intent/register/medium expectations (for grading)"}`;
    } else {
      spec = `Question type "rewrite": a realistic FIRST DRAFT — the kind of sentence a Chinese professional would actually type quickly at work (tone mismatched with intent, vague, or awkward for the medium), never a cartoonishly casual sentence no one would write.${draftVoice} The learner polishes the draft into what they would actually send or show.${intentRules}${mediumRules}`;
      schema = `{"kind":"rewrite","sentence":"...","intent":"<中文：你的沟通意图>","scenario":"...","note":"what the polished version must achieve given the intent and medium (for grading)"}`;
    }
  } else {
    const multi = level >= 4;
    // 卡池复习：复习入口必给卡；日常 session 只在有"到期"卡时以 35% 概率插入（SRS 不到期不打扰）
    reviewCard = opts.exam ? null : opts.forceReview ? pickReviewCard(state) : (Math.random() < 0.6 ? pickReviewCard(state, { dueOnly: true }) : null); // 考试不插复习卡；混编后组句题变少，提高到期卡插队概率
    if (reviewCard) {
      spec = `Question type "compose" (PHRASE REVIEW). Give a realistic meeting moment as a Chinese point to express, with a scenario. The learner MUST use the phrase "${reviewCard.better}" naturally in their English answer. Pick a fresh situation where this phrase fits well.`;
      schema = `{"kind":"compose","chinese":"...","scenario":"...","patternHint":null,"requiredPhrase":"${reviewCard.better}","note":"a strong answer uses the required phrase naturally"}`;
    } else {
    // 场景接龙（PRD 组句线题型3）：L2 起约 4 成概率出现，模拟"别人说一句、你接一句"的真实会议压力
    const useRelay = level >= 2 && Math.random() < 0.4;
    if (useRelay) {
      spec = `Question type "relay": simulate a live meeting moment. A colleague or boss says ONE line in English directed at the learner (a question, a pushback, or a request for the learner's view). The learner must type a reply in English under time pressure.${multi ? " The situation should call for a multi-move reply (acknowledge → state position → propose next step)." : " The situation should call for a ONE-SENTENCE reply, and the Chinese point MUST be short — at most ~40 Chinese characters, expressible as one natural English sentence. Never give a multi-move point at this level."} Include who is speaking in the scenario. CRITICAL — separate content from language: the learner must never have to invent WHAT to say; give them their intended reply as a short Chinese point ("chinese" field) — a natural, defensible response (e.g. 不同意+理由+替代方案). The question tests only HOW to say it in English.`;
      schema = `{"kind":"relay","sentence":"<the line spoken to the learner>","chinese":"<你要表达的意思，中文要点>","scenario":"...","note":"what a strong reply must accomplish (for grading)"}`;
    } else {
      spec = `Question type "compose": a realistic meeting moment. Give the meaning to express in Chinese${multi ? " (three linked moves: raise an issue → suggest → ask for input)" : " (ONE sentence, at most ~40 Chinese characters)"}${level === 1 ? ", plus a pattern hint like \"I'd suggest we...\"" : ""}${level === 3 ? ", and REQUIRE a given workplace pattern (e.g. \"My concern is...\", \"To build on that...\")" : ""}. Learner types the English under time pressure.`;
      schema = `{"kind":"compose","chinese":"...","scenario":"...","patternHint":${level === 1 ? '"..."' : "null"},"requiredPhrase":${level === 3 ? '"..."' : "null"},"note":"what a strong answer includes (for grading)"}`;
    }
    }
  }
  const revenge = revengeTag ? ` This is a REVENGE question: the learner recently made "${revengeTag}" errors — design the question so that error type is likely to be tested again.` : "";
  // 场景锚定：语域/组句题 50% 概率落在学习者真实工作话题里
  const topics = (state.materials && state.materials.topics) || [];
  const topicSpec = line !== "decode" && topics.length && Math.random() < 0.5
    ? ` Ground the scenario in the learner's REAL work domain: ${topics[Math.floor(Math.random() * topics.length)]}.`
    : "";
  const prompt = `You generate ONE practice question for a deliberate-practice workplace-English trainer. ${LEARNER}${topicSpec}
Line: ${line}. Level ${level}: ${LEVEL_DESC[line][level - 1]}.${revenge}
${spec}
Avoid reusing these recent materials: ${avoid || "none"} — even when re-testing the same structure, use a clearly different topic AND a different main verb.
Return ONLY valid JSON, no markdown, schema: ${schema}`;
  // 后台预取（用户无感）用 reasoner 出高质量题；现场生成（用户在等）降级用快速模型，等待不超过几秒
  const q = parseJSON(await callAI(prompt, 1, opts.background ? AI_MODEL_GEN : AI_MODEL_GRADE));
  q.line = line; q.level = level;
  q.timeLimit = timeLimitFor(line, level, q.kind);
  // 复习题练的是"从记忆里提取短语"，比自由作答多一道工序，时限放宽 1.5 倍
  if (reviewCard && q.timeLimit > 0) q.timeLimit = Math.round(q.timeLimit * 1.5);
  // 主旨题脚手架渐撤：累计答对<3次时，答题界面预标功能标签+时限×1.5，避免 L3→L4 断崖直坠恐慌区
  // 考试模式素颜应试：脚手架强制关闭
  if (q.kind === "gist") {
    q.scaffold = !opts.exam && (state.gistOk || 0) < 3;
    if (q.scaffold && q.timeLimit > 0) q.timeLimit = Math.round(q.timeLimit * 1.5);
  }
  q.revenge = !!revengeTag;
  q.structKey = structKey;
  q.reviewCardId = reviewCard ? reviewCard.id : null;
  q.reviewPhrase = reviewCard ? reviewCard.better : null;
  q.materialId = materialId;
  q.retestId = opts.retestId || null; // 错题重考：对应错题本条目
  return q;
}

/* ---------------- 素材输入：从真实工作材料提取训练原料 ---------------- */
async function extractMaterial(text) {
  const prompt = `You are analyzing REAL workplace material pasted by the learner (slides, emails, IM). ${LEARNER}
Material: """${text.slice(0, 4000)}"""
Extract for deliberate practice:
1. "sentences": up to 6 sentences from the material that are structurally hard to read in one pass (long, nominalization, passive, stacked modifiers, buried main verb). Copy them EXACTLY as written. Skip trivial short sentences.
2. "expressions": up to 6 reusable professional phrases from the material worth memorizing — for each give "weak" (a typical weaker way to say it), "better" (the phrase as used, ≤5 words), "note" (≤8-word Chinese usage hint).
3. "topics": up to 5 short topic labels describing this work domain (e.g. "Q3 release planning", "supplier onboarding").
Return ONLY valid JSON: {"sentences":[{"text":"...","why":"which structure makes it hard"}],"expressions":[{"weak":"...","better":"...","note":"..."}],"topics":["..."]}`;
  return parseJSON(await callAI(prompt, 1, AI_MODEL_GEN));
}
// 选一条素材难句（用得少的优先）
function pickMaterialSentence(state) {
  const arr = (state.materials && state.materials.sentences) || [];
  if (!arr.length) return null;
  return [...arr].sort((a, b) => (a.used || 0) - (b.used || 0))[0];
}

/* ---------------- 预取：答题时后台生成下一题，消除等待 ---------------- */
const _prefetch = { key: null, promise: null };
const _qKeyOf = (line, level, revengeTag, opts = {}) => [line, level, revengeTag || "", opts.forceReview ? 1 : 0, opts.forceStruct || "", opts.retestId || "", opts.exam ? 1 : 0, opts.genre || ""].join("|");
function prefetchQuestion(line, level, state, revengeTag, opts = {}) {
  const key = _qKeyOf(line, level, revengeTag, opts);
  if (_prefetch.key === key) return; // 已在预取同参数的题
  _prefetch.key = key;
  _prefetch.promise = genQuestion(line, level, state, revengeTag, { ...opts, background: true }).catch(() => null); // 失败静默，消费时回退现场生成
}
function genQuestionCached(line, level, state, revengeTag, opts = {}) {
  const key = _qKeyOf(line, level, revengeTag, opts);
  if (_prefetch.key === key && _prefetch.promise) {
    const p = _prefetch.promise;
    _prefetch.key = null; _prefetch.promise = null;
    return p.then((q) => {
      if (!q) return genQuestion(line, level, state, revengeTag, opts); // 预取失败 → 现场生成
      // 结构迁移保护：上题解码答错要求同结构重考，预取题结构不符则弃用
      if (line === "decode" && state.lastStruct && !state.lastStruct.correct && q.structKey !== state.lastStruct.key) {
        return genQuestion(line, level, state, revengeTag, opts);
      }
      return q;
    });
  }
  _prefetch.key = null; _prefetch.promise = null; // 参数对不上（升降级/换线/复仇位）→ 废弃过期预取
  return genQuestion(line, level, state, revengeTag, opts);
}

async function gradeAnswer(q, answer) {
  const prompt = `You are a deliberate-practice English coach. ${LEARNER}
Question (${q.line} line, level ${q.level}, type ${q.kind}): ${JSON.stringify({ sentence: q.sentence, passage: q.passage, chinese: q.chinese, intent: q.intent, scenario: q.scenario, requiredPhrase: q.requiredPhrase, note: q.note })}
Learner's answer: """${answer || "(empty — time ran out)"}"""
Grade it. Hints must point at problems WITHOUT giving the corrected words (coach, don't feed answers). Tags must come from: ${ERROR_TAGS.join(", ")} ("structure-misread" is ONLY for decode/reading questions, never for writing).
If the scenario names a medium, grade against that medium's REAL conventions — slide bullet: concise, fragments acceptable; IM: brief and natural-professional; external email: complete formal sentences. The reference must be what a competent native professional would ACTUALLY write in that medium, not textbook prose. Do not penalize concision that fits the medium.
FAITHFULNESS: the reference must preserve the original's factual content — never invent or upgrade facts the writer did not state (e.g. "some issues" must NOT become "critical bugs"), and never add NEW commitments, deadlines, or requests the draft does not contain (e.g. do NOT invent "by EOD" or "please confirm"). If adding a call-to-action or specifics would strengthen the message in real life, say so in the explanation as ADVICE ONLY — the reference itself stays faithful. Also: do not "correct" wording that is already idiomatic native usage in that medium.
If the question gives the intended content as a Chinese point, grade ONLY how well the English expresses that point — never judge the position itself, and never penalize content that follows the given point.
TONE = INTENT MATCH: if an "intent" is given, the ONLY tone standard is whether the tone matches that intent. Hedging is a TOOL, not an error — when the intent is tentative (seeking input, soft disagreement), well-formed softeners (What if we... / One option could be... / I'm leaning toward X) are REQUIRED and stripping them is an error; when the intent is announcing a decision, tentative phrasing is the error. NEVER universally reward "more confident/direct". The reference must express the SAME intent with matched tone.
PHRASE VERDICT: if the question has a requiredPhrase, include "phraseOk" in your JSON — true only if the learner used that phrase correctly and naturally. Judge this INDEPENDENTLY of all other errors: a sentence with a tense slip elsewhere but a perfect use of the required phrase gets phraseOk=true; a high-scoring sentence that used the phrase awkwardly gets phraseOk=false.
CARDS: extract 0-2 reusable PHRASE-LEVEL upgrades worth memorizing (a set phrase, collocation, or pattern — NOT a whole sentence). For each: "weak" = what the learner wrote or a typical weak version, "better" = the natural professional phrase (≤5 words), "note" = a ≤8-word Chinese hint on when/how to use it. Only include genuinely reusable expressions; if the answer was already strong, return [].
Return ONLY valid JSON: {"score":0-100,"pass":true|false (pass = score>=70),"phraseOk":true|false|null (null if no requiredPhrase),"issues":[{"tag":"...","hint":"one short English sentence pointing at the problem"}],"reference":"a strong native version","explanation":"2-3 plain-English sentences on why the reference works better","cards":[{"weak":"...","better":"...","note":"..."}]}`;
  const g = parseJSON(await callAI(prompt));
  // 代码层硬约束（不依赖模型自觉）：结构误读标签只属于解码题
  if (q.line !== "decode" && Array.isArray(g.issues)) {
    g.issues = g.issues.filter((i) => i.tag !== "structure-misread");
  }
  return g;
}

async function simplifyText(text) {
  return await callAI(`Rewrite this feedback in very simple English (short sentences, common words, A2 level). Keep the meaning. Return only the rewritten text:\n${text}`);
}
async function toChinese(text) {
  return await callAI(`Translate this feedback into natural Chinese. Return only the translation:\n${text}`);
}

/* ---------------- adaptive logic ---------------- */
function applyResult(state, line, res) {
  const { correct, tags, structKey, wrongEntry, cards, reviewCardId, reviewOk, retestId, materialId } = res || {};
  const s = { ...state, streaks: { ...state.streaks }, levels: { ...state.levels }, errorMap: { ...state.errorMap }, recentWrong: [...state.recentWrong] };
  // 素材句用过一次记一次（轮换出题用）
  if (materialId && s.materials && s.materials.sentences) {
    s.materials = { ...s.materials, sentences: s.materials.sentences.map((m) => m.text === materialId ? { ...m, used: (m.used || 0) + 1 } : m) };
  }
  // 表达卡池：合并新卡片；复习题按 SRS 调度——答对且用上短语→间隔升档+记一次主动使用（≥2 次 → 已掌握），否则间隔归零
  let book = mergeCards(state.expressionBook || [], cards, line);
  if (reviewCardId) {
    book = book.map((c) => {
      if (c.id !== reviewCardId) return c;
      const used = (c.used || 0) + (reviewOk ? 1 : 0);
      return { ...c, used, mastered: used >= 2, srs: reviewOk ? srsAdvance(c.srs) : srsReset() };
    });
  }
  s.expressionBook = book;
  // 结构账本 + SRS：答对间隔升档，答错归零（明天就会回来）
  if (line === "decode" && structKey) {
    const m = (s.structMastery || {})[structKey] || { seen: 0, correct: 0 };
    s.structMastery = { ...s.structMastery, [structKey]: { seen: m.seen + 1, correct: m.correct + (correct ? 1 : 0), srs: correct ? srsAdvance(m.srs) : srsReset() } };
    s.lastStruct = { key: structKey, correct };
  }
  // 主旨题脚手架计数：累计答对3次后撤除预标标签
  if (line === "decode" && res.kind === "gist" && correct) s.gistOk = (s.gistOk || 0) + 1;
  // 错题重考：通过→间隔升档（逐渐淡出），又错→归零重来
  if (retestId) {
    s.wrongBook = (s.wrongBook || []).map((w) => w.id === retestId ? { ...w, srs: correct ? srsAdvance(w.srs) : srsReset() } : w);
  }
  if (wrongEntry) s.wrongBook = [...(s.wrongBook || []), wrongEntry].slice(-100);
  // 流利度日志：限时题全量记录（对错都记），自动化的证据在这条曲线里
  if (res.timeLimit > 0 && res.timeUsed != null) {
    s.speedLog = [...(s.speedLog || []), {
      t: Date.now(), line, ok: !!correct,
      frac: Math.round((res.timeUsed / res.timeLimit) * 100) / 100,
      sec: res.timeUsed, wc: res.wc || null, lv: res.lv || null,
    }].slice(-300);
  }
  const st = { ...s.streaks[line] };
  if (correct) { st.c += 1; st.w = 0; } else { st.w += 1; st.c = 0; }
  let leveled = 0;
  if (st.c >= 2 && s.levels[line] < 5) { s.levels[line] += 1; st.c = 0; leveled = 1; }
  if (st.w >= 2 && s.levels[line] > 1) { s.levels[line] -= 1; st.w = 0; leveled = -1; }
  s.streaks[line] = st;
  if (!correct) {
    (tags || []).forEach((t) => { s.errorMap[t] = (s.errorMap[t] || 0) + 1; });
    if (tags && tags[0]) s.recentWrong = [...s.recentWrong.slice(-5), { line, tag: tags[0] }];
  }
  return { state: s, leveled };
}
function weakestLine(state) {
  return [...LINE_KEYS].sort((a, b) => state.levels[a] - state.levels[b])[0];
}

/* ---------------- small UI atoms ---------------- */
function Btn({ children, onClick, kind = "primary", disabled, small }) {
  const base = {
    ...disp, fontWeight: 700, border: "none", cursor: disabled ? "not-allowed" : "pointer",
    borderRadius: 10, padding: small ? "8px 14px" : "13px 22px", fontSize: small ? 13 : 15,
    opacity: disabled ? 0.45 : 1, transition: "transform .08s",
  };
  const kinds = {
    primary: { background: C.accent, color: "#fff" },
    ghost: { background: "transparent", color: C.ink, border: `1.5px solid ${C.line}` },
    danger: { background: C.badSoft, color: C.bad },
    good: { background: C.good, color: "#fff" },
  };
  return <button onClick={disabled ? undefined : onClick} style={{ ...base, ...kinds[kind] }}>{children}</button>;
}

function Tag({ children, tone = "accent" }) {
  const map = { accent: [C.accentSoft, C.accent], good: [C.goodSoft, C.good], bad: [C.badSoft, C.bad], amber: [C.amberSoft, C.amber] };
  const [bg, fg] = map[tone];
  return <span style={{ ...mono, fontSize: 11, background: bg, color: fg, borderRadius: 6, padding: "3px 8px", letterSpacing: 0.4 }}>{children}</span>;
}

function TimerRing({ total, left }) {
  const r = 26, circ = 2 * Math.PI * r;
  const frac = total > 0 ? Math.max(0, left / total) : 1;
  const danger = total > 0 && left <= Math.max(3, total * 0.25);
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-label={`${left} seconds left`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke={C.line} strokeWidth="5" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={danger ? C.bad : C.accent} strokeWidth="5"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - frac)} strokeLinecap="round"
        transform="rotate(-90 32 32)" style={{ transition: "stroke-dashoffset 1s linear, stroke .3s" }} />
      <text x="32" y="38" textAnchor="middle" style={{ ...disp, fontWeight: 900 }} fontSize="18" fill={danger ? C.bad : C.ink}>
        {total > 0 ? left : "∞"}
      </text>
    </svg>
  );
}

function LevelRail({ level, color }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((l) => (
        <div key={l} style={{
          width: l === level ? 22 : 12, height: 8, borderRadius: 4,
          background: l <= level ? color : C.line, transition: "all .3s",
        }} />
      ))}
      <span style={{ ...mono, fontSize: 12, color: C.sub, marginLeft: 6 }}>L{level}</span>
    </div>
  );
}

function FeedbackText({ text }) {
  const [shown, setShown] = useState(text);
  const [mode, setMode] = useState("en");
  const [busy, setBusy] = useState(false);
  const go = async (m) => {
    if (busy) return;
    setBusy(true);
    try {
      if (m === "simple") setShown(await simplifyText(text));
      else if (m === "zh") setShown(await toChinese(text));
      else setShown(text);
      setMode(m);
    } catch (e) { setShown(text); }
    setBusy(false);
  };
  return (
    <div>
      <p style={{ margin: "6px 0", lineHeight: 1.6, color: C.ink, fontSize: 14, opacity: busy ? 0.5 : 1 }}>{shown}</p>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        {mode !== "en" && <button onClick={() => go("en")} style={linkBtn}>Original</button>}
        {mode !== "simple" && <button onClick={() => go("simple")} style={linkBtn}>Simpler ↓</button>}
        {mode !== "zh" && <button onClick={() => go("zh")} style={linkBtn}>中文</button>}
      </div>
    </div>
  );
}
const linkBtn = { ...mono, background: "none", border: "none", color: C.accent, fontSize: 12, cursor: "pointer", padding: 0 };

/* ---------------- 句子解剖：在原句上划线标出主谓宾 ---------------- */
function AnnotatedSentence({ sentence, core }) {
  if (!sentence || !core) return null;
  const marks = [];
  let cursor = 0;
  [["主", core.subject, "#2E5BFF"], ["谓", core.verb, "#D64545"], ["宾", core.object, "#0E9F6E"]].forEach(([label, txt, color]) => {
    if (!txt || typeof txt !== "string") return;
    const i = sentence.indexOf(txt, cursor); // 按语序依次查找，避免重复词错位
    if (i === -1) return;
    marks.push({ start: i, end: i + txt.length, label, color });
    cursor = i + txt.length;
  });
  if (!marks.length) return null; // AI 给的片段对不上原句时安静放弃，不显示错的标注
  const parts = [];
  let pos = 0;
  marks.forEach((m, k) => {
    if (m.start > pos) parts.push(<span key={"t" + k} style={{ color: C.sub }}>{sentence.slice(pos, m.start)}</span>);
    parts.push(
      <span key={"m" + k} style={{ borderBottom: `3px solid ${m.color}`, paddingBottom: 1, color: C.ink, fontWeight: 600 }}>
        {sentence.slice(m.start, m.end)}
        <sup style={{ ...mono, fontSize: 9, color: m.color, marginLeft: 1, fontWeight: 700 }}>{m.label}</sup>
      </span>
    );
    pos = m.end;
  });
  parts.push(<span key="tail" style={{ color: C.sub }}>{sentence.slice(pos)}</span>);
  return (
    <div style={{ padding: 12, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, marginTop: 10 }}>
      <p style={{ ...mono, fontSize: 10, color: C.sub, margin: "0 0 6px", letterSpacing: 1 }}>
        句子解剖 · <span style={{ color: "#2E5BFF" }}>主</span> <span style={{ color: "#D64545" }}>谓</span> <span style={{ color: "#0E9F6E" }}>宾</span> · 灰色都是修饰成分
      </p>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 2, ...body }}>{parts}</p>
    </div>
  );
}

/* ---------------- 段落解剖：逐句功能标签 + 主旨公式（多句版的"主谓宾划线"） ---------------- */
const GIST_ROLES = {
  problem: ["问题", "#D64545"], action: ["行动", "#2E5BFF"], result: ["预期效果", "#0E9F6E"],
  timeline: ["节奏", "#C77D1F"], detail: ["细节·可忽略", "#5A6B85"],
};
function ParagraphAnatomy({ anatomy, formula }) {
  if (!Array.isArray(anatomy) || !anatomy.length) return null;
  return (
    <div>
      {formula && (
        <p style={{ ...mono, fontSize: 11, color: C.sub, margin: "0 0 8px", letterSpacing: 0.3 }}>
          主旨公式 = <span style={{ color: "#D64545" }}>问题</span> + <span style={{ color: "#2E5BFF" }}>核心行动</span> +（<span style={{ color: "#C77D1F" }}>节奏</span>）· 细节句直接扔掉
        </p>
      )}
      {anatomy.map((s, i) => {
        const [label, color] = GIST_ROLES[s.role] || ["", C.sub];
        const dim = s.role === "detail";
        return (
          <div key={i} style={{ borderLeft: `3px solid ${color}`, background: "#fff", borderRadius: 6, padding: "8px 12px", marginBottom: 6, opacity: dim ? 0.55 : 1 }}>
            <span style={{ ...mono, fontSize: 10, fontWeight: 700, color, letterSpacing: 0.5 }}>{s.zh || label}</span>
            <p style={{ margin: "3px 0 0", fontSize: 14, lineHeight: 1.6, color: C.ink }}>{s.sentence}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Question Card ---------------- */
function QuestionCard({ q, onDone, qNum, qTotal, silent }) {
  // 组句/接龙题两段式：读题不计时（真实会议里"想说什么"本就在脑子里，读中文要点是装置开销），开表后只压英语产出
  const [phase, setPhase] = useState(() => (q.kind === "compose" || q.kind === "relay" ? "read" : "answer")); // read | answer | grading | coach | reveal | mcqdone
  const [input, setInput] = useState("");
  const [picked, setPicked] = useState(null);
  const [picks, setPicks] = useState([null, null, null]); // judge3 三判
  const [grade, setGrade] = useState(null);
  const [left, setLeft] = useState(q.timeLimit);
  const [attempt, setAttempt] = useState(1);
  const submittedRef = useRef(false);
  const timedOutRef = useRef(false);
  const inputRef = useRef("");
  inputRef.current = input;

  useEffect(() => {
    if (q.timeLimit <= 0 || phase !== "answer") return;
    if (left <= 0) { handleSubmit(true); return; }
    const t = setTimeout(() => setLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [left, phase]); // eslint-disable-line

  const isMCQ = q.kind === "trunk" || q.kind === "judge";
  const isBatch = q.kind === "judge3";

  async function handleSubmit(auto = false) {
    if (submittedRef.current) return;
    submittedRef.current = true;
    if (auto) timedOutRef.current = true;
    if (isBatch) {
      const per = (q.items || []).map((it, i) => picks[i] === it.answerIndex);
      const g = { correct: per.every(Boolean), per }; // 全对才算对——连对2题=连续判对6句，L1毕业证据更扎实
      setGrade(g);
      if (silent) { finish(g); return; } // 考试模式：不显示反馈，直接交卷
      setPhase("mcqdone");
      return;
    }
    if (isMCQ) {
      const correct = picked === q.answerIndex && picked !== null;
      const g = { correct };
      setGrade(g);
      if (silent) { finish(g); return; }
      setPhase("mcqdone");
      return;
    }
    setPhase("grading");
    try {
      const g = await gradeAnswer(q, inputRef.current);
      setGrade(g);
      if (silent) { finish(g); return; }
      setPhase(g.pass ? "reveal" : "coach");
    } catch (e) {
      const g = { score: 0, pass: false, issues: [], reference: "—", explanation: "Grading failed — network issue. This question won't count." };
      setGrade(g);
      if (silent) { finish(g); return; }
      setPhase("reveal");
    }
  }

  async function handleRetry() {
    setPhase("grading");
    try {
      const g = await gradeAnswer(q, inputRef.current);
      setGrade(g);
      setPhase("reveal");
      setAttempt(2);
    } catch (e) { setPhase("reveal"); }
  }

  function finish(gOverride) {
    const g = gOverride || grade; // 静默模式（考试）直接传入判分结果，绕过 state 时序
    let correct, tags = [];
    if (isMCQ || isBatch) { correct = g.correct; if (isBatch && !correct) tags = ["register"]; }
    else { correct = !!g.pass && attempt === 1; tags = (g.issues || []).map((i) => i.tag); }
    const label = (i) => (i == null ? "(未选)" : q.options[i]);
    let wrongEntry = null;
    if (!correct) {
      wrongEntry = {
        id: "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        srs: srsInit(), // 明天到期重考
        date: new Date().toISOString().slice(0, 10),
        line: q.line, level: q.level, kind: q.kind, structKey: q.structKey || null,
        question: isBatch ? (q.items || []).map((it) => it.sentence).join(" ／ ") : (q.sentence || q.passage || q.chinese || ""),
        scenario: q.scenario || null,
        userAnswer: isBatch
          ? (q.items || []).map((it, i) => label(picks[i])).join(" / ")
          : isMCQ
          ? (picked === null ? "(超时未答)" : q.options[picked])
          : (inputRef.current || "(超时未答)"),
        reference: isBatch
          ? (q.items || []).map((it) => q.options[it.answerIndex]).join(" / ")
          : isMCQ ? q.options[q.answerIndex] : (g.reference || ""),
        issues: isBatch
          ? (q.items || []).filter((it, i) => picks[i] !== it.answerIndex).map((it) => ({ tag: "register", hint: it.why || it.sentence }))
          : isMCQ
          ? (q.why ? [{ tag: "structure-misread", hint: q.why }] : [])
          : (g.issues || []),
        timedOut: timedOutRef.current, // 超时(没读完/没写完)和误读是两种不同的问题
        timeUsed: q.timeLimit > 0 ? q.timeLimit - left : null,
        timeLimit: q.timeLimit > 0 ? q.timeLimit : null,
      };
    }
    // 卡池：抽取新卡片；复习卡的升降档只看"短语本身用得对不对"（phraseOk 独立裁决），
    // 不被句子里其他知识点的错误污染——整题对错另行影响等级/连对
    const cards = !isMCQ ? (g.cards || []) : [];
    const usedReviewWord = q.reviewPhrase && normPhrase(inputRef.current).includes(normPhrase(q.reviewPhrase));
    onDone({
      correct, tags, partialPass: !isMCQ && g.pass && attempt === 2,
      structKey: q.structKey, wrongEntry, cards,
      reviewCardId: q.reviewCardId || null, reviewOk: !!(usedReviewWord && g.phraseOk !== false),
      score: g.score != null ? g.score : (g.correct ? 100 : 0),
      retestId: q.retestId || null,
      line: q.line, kind: q.kind,
      qText: isBatch ? (q.items || []).map((it) => it.sentence).join(" | ") : (q.sentence || q.passage || q.chinese || ""),
      materialId: q.materialId,
      timeUsed: q.timeLimit > 0 ? q.timeLimit - left : null, // 答对的也记时——流利度=正确率不降、用时下降
      timeLimit: q.timeLimit > 0 ? q.timeLimit : null,
      // 词数：解码记"读了多少词"，产出题记"写了多少词"——流利度用 wpm 度量，消除句长噪声
      wc: (() => {
        const t = q.line === "decode" ? (q.sentence || q.passage || "") : (isBatch ? "" : (inputRef.current || ""));
        const n = t.trim() ? t.trim().split(/\s+/).length : 0;
        return n || null;
      })(),
      lv: q.level, // 等级入日志——流利度只在同等级内比较，升级导致的变慢不算退步
    });
  }

  const prompt = q.kind === "trunk" ? "Pick the core meaning (who does what):"
    : q.kind === "gist" ? (q.level === 5 ? "Write a one-line gist in English:" : "Write a one-line gist (中文 or English):")
    : q.kind === "judge" ? "What register is this sentence?"
    : q.kind === "judge3" ? "Three quick calls — judge each register:"
    : q.kind === "rewrite" ? (q.level >= 4 ? "Write it in English, register-appropriate:" : "Rewrite it properly:")
    : q.kind === "relay" ? "They're waiting — type your reply:"
    : "Say it in English:";

  return (
    <div style={{ background: C.surface, borderRadius: 16, padding: 22, boxShadow: "0 1px 4px rgba(16,29,51,.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Tag tone="accent">{LINES[q.line].name} · L{q.level}</Tag>
          {q.revenge && <Tag tone="bad">REVENGE</Tag>}
          {q.retestId && <Tag tone="amber">错题重考</Tag>}
          {q.materialId && <Tag tone="good">真实素材</Tag>}
          <span style={{ ...mono, fontSize: 12, color: C.sub }}>{qNum}/{qTotal}</span>
        </div>
        {phase === "answer" && <TimerRing total={q.timeLimit} left={left} />}
      </div>

      {q.scenario && (
        <div style={{ background: C.amberSoft, borderLeft: `3px solid ${C.amber}`, borderRadius: 8, padding: "10px 14px", marginBottom: 12, display: "flex", gap: 10, alignItems: "baseline" }}>
          <span style={{ ...mono, fontSize: 10, fontWeight: 700, color: C.amber, letterSpacing: 1, flexShrink: 0 }}>SCENARIO</span>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: C.ink }}>{q.scenario}</p>
        </div>
      )}

      <div style={{ background: C.bg, borderRadius: 10, padding: 14, marginBottom: 14, display: isBatch ? "none" : "block" }}>
        {q.kind === "gist" && q.scaffold && Array.isArray(q.anatomy) && q.anatomy.length ? (
          <div>
            <p style={{ fontSize: 12, color: C.sub, margin: "0 0 8px" }}>🪜 新手脚手架：功能标签已帮你标好（答对 3 次后撤除）——你只需练"组装主旨"这一步</p>
            <ParagraphAnatomy anatomy={q.anatomy} formula />
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.65, color: C.ink, whiteSpace: "pre-wrap" }}>
            {q.sentence || q.passage || q.chinese}
          </p>
        )}
        {q.kind === "relay" && q.chinese && (
          <p style={{ margin: "10px 0 0", paddingTop: 10, borderTop: `1px dashed ${C.line}`, fontSize: 14, lineHeight: 1.6, color: C.accent }}>
            你要表达：{q.chinese}
          </p>
        )}
        {q.intent && (
          <p style={{ margin: "10px 0 0", paddingTop: 10, borderTop: `1px dashed ${C.line}`, fontSize: 14, lineHeight: 1.6, color: "#7A3EF0", fontWeight: 600 }}>
            🎯 你的意图：{q.intent}
          </p>
        )}
        {q.patternHint && <p style={{ ...mono, margin: "8px 0 0", fontSize: 12, color: C.accent }}>Pattern hint: {q.patternHint}</p>}
        {q.requiredPhrase && <p style={{ ...mono, margin: "8px 0 0", fontSize: 12, color: C.amber }}>Must use: “{q.requiredPhrase}”</p>}
      </div>

      <p style={{ ...disp, fontWeight: 700, fontSize: 14, margin: "0 0 10px", color: C.ink }}>{prompt}</p>

      {/* READ PHASE: 读题消化不计时，开表后只压英语产出 */}
      {phase === "read" && (
        <div>
          <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.6, margin: "0 0 12px" }}>
            先消化场景和你要表达的内容，在脑子里组织好思路——真实会议里，想说什么本来就在你心里，所以这一步不计时。倒计时只测一件事：把想法变成英语的速度。
          </p>
          <Btn onClick={() => setPhase("answer")}>想好了，开始作答 ⏱ {q.timeLimit}s</Btn>
        </div>
      )}

      {/* ANSWER PHASE */}
      {phase === "answer" && isBatch && (
        <div style={{ display: "grid", gap: 12 }}>
          {(q.items || []).map((it, i) => (
            <div key={i} style={{ background: C.bg, borderRadius: 10, padding: 12 }}>
              <p style={{ margin: "0 0 8px", fontSize: 14.5, lineHeight: 1.55, color: C.ink }}>{i + 1}. {it.sentence}</p>
              <div style={{ display: "flex", gap: 8 }}>
                {q.options.map((opt, j) => (
                  <button key={j} onClick={() => setPicks(picks.map((p, k) => (k === i ? j : p)))} style={{
                    flex: 1, padding: "8px 6px", borderRadius: 8, cursor: "pointer", fontSize: 13, ...body,
                    border: `2px solid ${picks[i] === j ? C.accent : C.line}`,
                    background: picks[i] === j ? C.accentSoft : "#fff", color: C.ink,
                  }}>{opt}</button>
                ))}
              </div>
            </div>
          ))}
          <div><Btn onClick={() => handleSubmit()} disabled={picks.some((p) => p === null)}>Lock answers</Btn></div>
        </div>
      )}
      {phase === "answer" && isMCQ && (
        <div style={{ display: "grid", gap: 8 }}>
          {q.options.map((opt, i) => (
            <button key={i} onClick={() => setPicked(i)} style={{
              textAlign: "left", padding: "12px 14px", borderRadius: 10, cursor: "pointer", fontSize: 14, ...body,
              border: `2px solid ${picked === i ? C.accent : C.line}`,
              background: picked === i ? C.accentSoft : "#fff", color: C.ink,
            }}>{opt}</button>
          ))}
          <div style={{ marginTop: 6 }}><Btn onClick={() => handleSubmit()} disabled={picked === null}>Lock answer</Btn></div>
        </div>
      )}
      {phase === "answer" && !isMCQ && (
        <div>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={3} autoFocus
            placeholder="Type here — the clock is running…"
            style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, border: `2px solid ${C.line}`, padding: 12, fontSize: 15, ...body, resize: "vertical", outline: "none" }} />
          <div style={{ marginTop: 10 }}><Btn onClick={() => handleSubmit()} disabled={!input.trim()}>Submit</Btn></div>
        </div>
      )}

      {phase === "grading" && <p style={{ ...mono, color: C.sub, fontSize: 13 }}>Coach is reading your answer…</p>}

      {/* MCQ RESULT */}
      {phase === "mcqdone" && isBatch && (
        <div>
          <div style={{ display: "grid", gap: 10 }}>
            {(q.items || []).map((it, i) => {
              const right = picks[i] === it.answerIndex;
              return (
                <div key={i} style={{ borderRadius: 10, padding: 12, background: right ? C.goodSoft : C.badSoft, border: `2px solid ${right ? C.good : C.bad}` }}>
                  <p style={{ margin: "0 0 4px", fontSize: 14.5, lineHeight: 1.55, color: C.ink }}>{i + 1}. {it.sentence}</p>
                  <p style={{ ...mono, margin: 0, fontSize: 12, color: right ? C.good : C.bad }}>
                    {right ? `✓ ${q.options[it.answerIndex]}` : `✗ 你选 ${picks[i] == null ? "（超时未选）" : q.options[picks[i]]} → 应为 ${q.options[it.answerIndex]}`}
                  </p>
                  {!right && it.why && <p style={{ margin: "4px 0 0", fontSize: 12.5, lineHeight: 1.5, color: C.ink }}>{it.why}</p>}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Tag tone={grade.correct ? "good" : "bad"}>{grade.correct ? "3/3 CORRECT" : `${(grade.per || []).filter(Boolean).length}/3 · 需全对`}</Tag>
          </div>
          <div style={{ marginTop: 12 }}><Btn onClick={finish}>Next →</Btn></div>
        </div>
      )}
      {phase === "mcqdone" && !isBatch && (
        <div>
          <div style={{ display: "grid", gap: 8 }}>
            {q.options.map((opt, i) => (
              <div key={i} style={{
                padding: "12px 14px", borderRadius: 10, fontSize: 14,
                border: `2px solid ${i === q.answerIndex ? C.good : i === picked ? C.bad : C.line}`,
                background: i === q.answerIndex ? C.goodSoft : i === picked ? C.badSoft : "#fff",
              }}>{opt}</div>
            ))}
          </div>
          <div style={{ marginTop: 12, padding: 12, background: C.bg, borderRadius: 10 }}>
            <Tag tone={grade.correct ? "good" : "bad"}>{grade.correct ? "CORRECT" : picked === null ? "TIME OUT" : "MISSED"}</Tag>
            {q.kind === "trunk" && <AnnotatedSentence sentence={q.sentence} core={q.core} />}
            <FeedbackText text={q.why || ""} />
          </div>
          <div style={{ marginTop: 12 }}><Btn onClick={finish}>Next →</Btn></div>
        </div>
      )}

      {/* COACH PHASE: hints only, learner revises */}
      {phase === "coach" && grade && (
        <div>
          <div style={{ padding: 12, background: C.amberSoft, borderRadius: 10, marginBottom: 10 }}>
            <p style={{ ...disp, fontWeight: 700, fontSize: 13, margin: "0 0 6px", color: C.amber }}>Coach sees issues — fix them yourself first:</p>
            {(grade.issues || []).map((iss, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                <Tag tone="amber">{iss.tag}</Tag>
                <FeedbackText text={iss.hint} />
              </div>
            ))}
          </div>
          {q.kind === "gist" && Array.isArray(q.anatomy) && q.anatomy.length > 0 && (
            <div style={{ padding: 12, background: C.bg, borderRadius: 10, marginBottom: 10 }}>
              <ParagraphAnatomy anatomy={q.anatomy} formula />
            </div>
          )}
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={3}
            style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, border: `2px solid ${C.amber}`, padding: 12, fontSize: 15, ...body, resize: "vertical", outline: "none" }} />
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <Btn onClick={handleRetry}>Re-submit revision</Btn>
            <Btn kind="ghost" onClick={() => setPhase("reveal")}>I'm stuck — show reference</Btn>
          </div>
        </div>
      )}

      {/* REVEAL PHASE */}
      {phase === "reveal" && grade && (
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <Tag tone={grade.pass ? "good" : "bad"}>{grade.pass ? `PASS · ${grade.score}` : `SCORE ${grade.score}`}</Tag>
            {attempt === 2 && <Tag tone="amber">2nd attempt</Tag>}
          </div>
          {(grade.issues || []).length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {grade.issues.map((iss, i) => <Tag key={i} tone="bad">{iss.tag}</Tag>)}
            </div>
          )}
          {q.kind === "gist" && Array.isArray(q.anatomy) && q.anatomy.length > 0 && (
            <div style={{ padding: 12, background: C.bg, borderRadius: 10, marginBottom: 10 }}>
              <p style={{ ...mono, fontSize: 10, color: C.sub, margin: "0 0 8px", letterSpacing: 1 }}>段落解剖 — 熟练读者的内心戏</p>
              <ParagraphAnatomy anatomy={q.anatomy} formula />
            </div>
          )}
          <div style={{ padding: 12, background: C.goodSoft, borderRadius: 10, marginBottom: 10 }}>
            <p style={{ ...mono, fontSize: 11, color: C.good, margin: "0 0 4px" }}>REFERENCE</p>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: C.ink, whiteSpace: "pre-wrap" }}>{grade.reference}</p>
          </div>
          <div style={{ padding: 12, background: C.bg, borderRadius: 10 }}>
            <FeedbackText text={grade.explanation || ""} />
          </div>
          <div style={{ marginTop: 12 }}><Btn onClick={finish}>Next →</Btn></div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Question Runner (shared by placement / session / free) ---------------- */
function QuestionLoader({ line, level, state, revengeTag, opts, prefetchNext, children }) {
  const [q, setQ] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let dead = false;
    setQ(null); setErr(false);
    genQuestionCached(line, level, state, revengeTag, opts || {})
      .then((qq) => {
        if (dead) return;
        setQ(qq);
        // 当前题已上屏 → 后台预取下一题（预测参数由父组件给出）
        if (prefetchNext) prefetchQuestion(prefetchNext.line, prefetchNext.level, state, prefetchNext.revengeTag, prefetchNext.opts || {});
      })
      .catch(() => { if (!dead) setErr(true); });
    return () => { dead = true; };
  }, [line, level, revengeTag]); // eslint-disable-line
  if (err) return (
    <div style={{ background: C.surface, borderRadius: 16, padding: 24, textAlign: "center" }}>
      <p style={{ color: C.bad }}>Couldn't load the next question — network hiccup.</p>
      <Btn onClick={() => { setErr(false); genQuestion(line, level, state, revengeTag, opts || {}).then(setQ).catch(() => setErr(true)); }}>Retry</Btn>
    </div>
  );
  if (!q) return (
    <div style={{ background: C.surface, borderRadius: 16, padding: 36, textAlign: "center" }}>
      <p style={{ ...mono, color: C.sub, fontSize: 13 }}>Building your next question…</p>
      <div style={{ height: 4, borderRadius: 2, background: C.line, overflow: "hidden", marginTop: 12 }}>
        <div style={{ height: "100%", width: "40%", background: C.accent, borderRadius: 2, animation: "slide 1.1s infinite" }} />
      </div>
    </div>
  );
  return children(q);
}

/* ---------------- Placement ---------------- */
function Placement({ state, setState, onDone }) {
  const [lineIdx, setLineIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [lv, setLv] = useState(2);
  const [results, setResults] = useState({});
  const [qKey, setQKey] = useState(0);
  const line = LINE_KEYS[lineIdx];

  function handleDone({ correct }) {
    const nextLv = correct ? Math.min(5, lv + 1) : Math.max(1, lv - 1);
    if (step === 2) {
      const finalLv = correct ? lv : Math.max(1, lv - 1);
      const newResults = { ...results, [line]: finalLv };
      setResults(newResults);
      if (lineIdx === 2) { onDone(newResults); return; }
      setLineIdx(lineIdx + 1); setStep(0); setLv(2);
    } else {
      setLv(nextLv); setStep(step + 1);
    }
    setQKey((k) => k + 1);
  }

  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <p style={{ ...disp, fontWeight: 900, fontSize: 22, margin: "0 0 4px" }}>Placement Test</p>
      <p style={{ color: C.sub, fontSize: 14, margin: "0 0 16px" }}>
        9 questions, ~5 minutes. Each line starts at L2 — get it right and the next one is harder. This sets your real starting point so training never feels easy.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {LINE_KEYS.map((l, i) => (
          <Tag key={l} tone={i < lineIdx ? "good" : i === lineIdx ? "accent" : "amber"}>
            {LINES[l].name}{i < lineIdx ? ` ✓ L${results[l]}` : i === lineIdx ? ` · Q${step + 1}/3` : ""}
          </Tag>
        ))}
      </div>
      <QuestionLoader key={qKey} line={line} level={lv} state={state}>
        {(q) => <QuestionCard q={q} qNum={lineIdx * 3 + step + 1} qTotal={9} onDone={handleDone} />}
      </QuestionLoader>
    </div>
  );
}

/* ---------------- Session ---------------- */
function Session({ state, setState, persist, onExit }) {
  const [duration, setDuration] = useState(null);
  const [blockIdx, setBlockIdx] = useState(0);
  const [qIdx, setQIdx] = useState(0);
  const [results, setResults] = useState([]);
  const [view, setView] = useState("pick"); // pick | run | break | fatigue | summary
  const [breakLeft, setBreakLeft] = useState(120);
  const [qKey, setQKey] = useState(0);
  const startLevels = useRef(null);
  const Q_PER_BLOCK = 6;

  const nBlocks = duration ? duration / 15 : 0;
  const planRef = useRef(null);
  // 块内三线混编：弱线3题、中线2题、强线1题，交错排列（interleaving）。
  // 修复盲区：此前 15 分钟=只练最弱线，其他两线和卡池复习长期饿死
  function blockPlan(st) {
    const o = [...LINE_KEYS].sort((a, b) => st.levels[a] - st.levels[b]);
    return [o[0], o[1], o[2], o[0], o[1], o[0]];
  }

  useEffect(() => {
    if (view !== "break") return;
    if (breakLeft <= 0) return;
    const t = setTimeout(() => setBreakLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [view, breakLeft]);

  function start(mins) {
    startLevels.current = { ...state.levels };
    planRef.current = blockPlan(state); // 块开始时冻结本块出题计划，避免中途等级变化打乱当前块
    setDuration(mins); setView("run");
  }

  function handleQDone(res) {
    const line = res.line;
    const { state: ns } = applyResult(state, line, res);
    ns.lastTexts = [...(state.lastTexts || []), res.qText].filter(Boolean).slice(-8); // 修复：题目原文写入防重复名单
    setState(ns); persist(ns);
    const newResults = [...results, { ...res, line, block: blockIdx }];
    setResults(newResults);

    if (qIdx + 1 < Q_PER_BLOCK) { setQIdx(qIdx + 1); setQKey((k) => k + 1); return; }
    // block done
    const blockRes = newResults.filter((r) => r.block === blockIdx);
    const acc = blockRes.filter((r) => r.correct).length / blockRes.length;
    if (blockIdx + 1 >= nBlocks) { finishSession(newResults, ns); return; }
    if (blockIdx + 1 >= 2 && acc < 0.5) { setView("fatigue"); return; }
    setBreakLeft(120); setView("break");
  }

  function nextBlock() { planRef.current = blockPlan(state); setBlockIdx(blockIdx + 1); setQIdx(0); setQKey((k) => k + 1); setView("run"); }

  function finishSession(allResults, ns) {
    const correct = allResults.filter((r) => r.correct).length;
    const session = {
      date: new Date().toISOString().slice(0, 10), duration,
      total: allResults.length, correct,
      levelsBefore: startLevels.current, levelsAfter: { ...ns.levels },
    };
    const final = { ...ns, sessions: [...ns.sessions.slice(-30), session] };
    setState(final); persist(final);
    setView("summary");
  }

  const revengeIdx = 2; // 3rd question of each block is the revenge/retest slot if available
  // SRS 错题重考：该线有到期错题时，复仇位优先安排重考（换内容考同一弱点）
  const dueWrongFor = (ln) => {
    const arr = (state.wrongBook || []).filter((w) => w.id && w.line === ln && isDue(w));
    return arr.sort((a, b) => (((a.srs || {}).due) || 0) - (((b.srs || {}).due) || 0))[0] || null;
  };
  // 计算某个槽位的出题参数（复仇标签 + 重考选项），当前题和预取共用
  const slotParams = (idx, ln) => {
    if (idx !== revengeIdx) return { revengeTag: null, opts: undefined };
    const retest = dueWrongFor(ln);
    if (retest) {
      return {
        revengeTag: ((retest.issues || [])[0] || {}).tag || null,
        opts: { forceStruct: retest.line === "decode" ? retest.structKey || undefined : undefined, retestId: retest.id },
      };
    }
    return { revengeTag: state.recentWrong.length ? state.recentWrong[state.recentWrong.length - 1].tag : null, opts: undefined };
  };
  const plan = planRef.current || (duration ? blockPlan(state) : []);
  const qLine = plan[qIdx] || weakestLine(state);
  const cur = slotParams(qIdx, qLine);

  // 预取参数预测：块内下一题（按混编计划），或下一块第一题；升降级/复仇位不符时缓存 key 对不上会自动废弃重生成
  const prefetchNext = (() => {
    if (qIdx + 1 < Q_PER_BLOCK) {
      const ln = plan[qIdx + 1] || qLine;
      const nxt = slotParams(qIdx + 1, ln);
      return { line: ln, level: state.levels[ln], revengeTag: nxt.revengeTag, opts: nxt.opts };
    }
    if (blockIdx + 1 < nBlocks) {
      const ln = blockPlan(state)[0];
      return { line: ln, level: state.levels[ln], revengeTag: null };
    }
    return null;
  })();

  if (view === "pick") return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <p style={{ ...disp, fontWeight: 900, fontSize: 22, margin: "0 0 4px" }}>How much focus do you have today?</p>
      <p style={{ color: C.sub, fontSize: 14, marginBottom: 18 }}>Each 15-min block is one focused unit. Longer sessions interleave lines and force short breaks — tired practice is naive practice.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[15, 30, 45, 60].map((m) => (
          <button key={m} onClick={() => start(m)} style={{
            background: C.surface, border: `2px solid ${C.line}`, borderRadius: 14, padding: "18px 14px", cursor: "pointer", textAlign: "left",
          }}>
            <p style={{ ...disp, fontWeight: 900, fontSize: 24, margin: 0, color: C.ink }}>{m}<span style={{ fontSize: 13, color: C.sub }}> min</span></p>
            <p style={{ ...mono, fontSize: 11, color: C.sub, margin: "4px 0 0" }}>{m / 15} block{m > 15 ? "s" : ""}{m >= 60 ? " + fatigue watch" : m > 15 ? " + breaks" : ""}</p>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 16 }}><Btn kind="ghost" onClick={onExit}>← Back</Btn></div>
    </div>
  );

  if (view === "break") return (
    <Center>
      <p style={{ ...disp, fontWeight: 900, fontSize: 26, margin: 0 }}>Block {blockIdx + 1} done — step away.</p>
      <p style={{ color: C.sub, margin: "8px 0 18px" }}>Look out a window, stretch, get water. Next block: <b>a fresh mix</b> — your weakest line gets the most reps.</p>
      <p style={{ ...disp, fontWeight: 900, fontSize: 48, color: breakLeft > 0 ? C.accent : C.good, margin: "0 0 18px" }}>
        {Math.floor(breakLeft / 60)}:{String(breakLeft % 60).padStart(2, "0")}
      </p>
      <Btn onClick={nextBlock} disabled={breakLeft > 0}>{breakLeft > 0 ? "Resting…" : "Start next block"}</Btn>
    </Center>
  );

  if (view === "fatigue") return (
    <Center>
      <p style={{ ...disp, fontWeight: 900, fontSize: 24, margin: 0 }}>Accuracy is dropping.</p>
      <p style={{ color: C.sub, margin: "10px 0 18px", maxWidth: 420 }}>That's a fatigue signal. Practicing tired locks in mistakes instead of skills — ending now protects what you trained today.</p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <Btn kind="good" onClick={() => finishSession(results, state)}>End session (recommended)</Btn>
        <Btn kind="ghost" onClick={() => { setBreakLeft(120); setView("break"); }}>Push on</Btn>
      </div>
    </Center>
  );

  if (view === "summary") {
    const last = state.sessions[state.sessions.length - 1] || {};
    const ups = LINE_KEYS.filter((l) => last.levelsAfter && last.levelsBefore && last.levelsAfter[l] > last.levelsBefore[l]);
    const downs = LINE_KEYS.filter((l) => last.levelsAfter && last.levelsBefore && last.levelsAfter[l] < last.levelsBefore[l]);
    const next = weakestLine(state);
    return (
      <Center>
        <p style={{ ...mono, fontSize: 12, color: C.sub, margin: 0 }}>SESSION COMPLETE</p>
        <p style={{ ...disp, fontWeight: 900, fontSize: 30, margin: "4px 0 16px" }}>{last.correct}/{last.total} first-pass</p>
        <div style={{ textAlign: "left", background: C.surface, borderRadius: 14, padding: 18, maxWidth: 460, margin: "0 auto" }}>
          <Row label="Trained">{[...new Set(results.map((r) => LINES[r.line].name))].join(" · ")}</Row>
          <Row label="Moved up">{ups.length ? ups.map((l) => `${LINES[l].name} → L${last.levelsAfter[l]}`).join(", ") : "Held steady — that's how plateaus break"}</Row>
          {downs.length > 0 && <Row label="Recalibrated">{downs.map((l) => `${LINES[l].name} → L${last.levelsAfter[l]}`).join(", ")}</Row>}
          <Row label="Tomorrow">{`${LINES[next].name} gets priority — it's your weakest line`}</Row>
        </div>
        <div style={{ marginTop: 18 }}><Btn onClick={onExit}>Done</Btn></div>
      </Center>
    );
  }

  // run
  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, alignItems: "center" }}>
        <p style={{ ...mono, fontSize: 12, color: C.sub, margin: 0 }}>BLOCK {blockIdx + 1}/{nBlocks} · MIXED · now: {LINES[qLine].name.toUpperCase()}</p>
        <button onClick={onExit} style={{ ...linkBtn, color: C.sub }}>Exit</button>
      </div>
      <QuestionLoader key={qKey} line={qLine} level={state.levels[qLine]} state={state} revengeTag={cur.revengeTag} opts={cur.opts} prefetchNext={prefetchNext}>
        {(q) => <QuestionCard q={q} qNum={qIdx + 1} qTotal={Q_PER_BLOCK} onDone={handleQDone} />}
      </QuestionLoader>
    </div>
  );
}

function Center({ children }) {
  return <div style={{ maxWidth: 620, margin: "40px auto", textAlign: "center" }}>{children}</div>;
}
function Row({ label, children }) {
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
      <span style={{ ...mono, fontSize: 11, color: C.sub, minWidth: 92, paddingTop: 2 }}>{label.toUpperCase()}</span>
      <span style={{ fontSize: 14, color: C.ink }}>{children}</span>
    </div>
  );
}

/* ---------------- Free practice ---------------- */
function FreePractice({ state, setState, persist, onExit, reviewMode }) {
  const [line, setLine] = useState(reviewMode ? "build" : null);
  const [count, setCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [warn, setWarn] = useState(false);
  const [capHit, setCapHit] = useState(false); // 每日复习额度：防 SRS 积压压垮（死亡螺旋）
  const [qKey, setQKey] = useState(0);
  const REVIEW_CAP = 8;

  function handleDone(res) {
    const ln = res.line || line;
    const { state: ns } = applyResult(state, ln, res);
    ns.lastTexts = [...(state.lastTexts || []), res.qText].filter(Boolean).slice(-8); // 防重复名单
    setState(ns); persist(ns);
    const c = count + 1, cc = correctCount + (res.correct ? 1 : 0);
    setCount(c); setCorrectCount(cc);
    if (reviewMode && c === REVIEW_CAP) { setCapHit(true); return; }
    if (c % 10 === 0 && cc / c < 0.5) { setWarn(true); return; }
    setQKey((k) => k + 1);
  }

  if (reviewMode && !pickReviewCard(state)) return (
    <Center>
      <p style={{ ...disp, fontWeight: 900, fontSize: 22 }}>卡池暂时没有待复习的表达</p>
      <p style={{ color: C.sub, maxWidth: 420, margin: "8px auto 18px" }}>多做几次组句/语域训练，遇到更好的说法会自动存进卡池，到期后回来复习。</p>
      <Btn kind="ghost" onClick={onExit}>← Back</Btn>
    </Center>
  );

  if (!line) return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <p style={{ ...disp, fontWeight: 900, fontSize: 22 }}>Free practice — pick a line</p>
      <div style={{ display: "grid", gap: 10 }}>
        {LINE_KEYS.map((l) => (
          <button key={l} onClick={() => setLine(l)} style={{ background: C.surface, border: `2px solid ${C.line}`, borderRadius: 14, padding: 16, cursor: "pointer", textAlign: "left" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ ...disp, fontWeight: 700, fontSize: 16 }}>{LINES[l].name}</span>
              <LevelRail level={state.levels[l]} color={LINES[l].color} />
            </div>
            <p style={{ fontSize: 13, color: C.sub, margin: "4px 0 0" }}>{LINES[l].goal}</p>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 16 }}><Btn kind="ghost" onClick={onExit}>← Back</Btn></div>
    </div>
  );

  if (capHit) return (
    <Center>
      <p style={{ ...disp, fontWeight: 900, fontSize: 24 }}>今日复习额度已完成 ✅</p>
      <p style={{ color: C.sub, maxWidth: 420, margin: "8px auto 18px" }}>间隔复习贵在每天少量，不在一次清空。没做完的会自动顺延，明天优先出现——积压不是债务，是排队。</p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <Btn kind="good" onClick={onExit}>今天到这（推荐）</Btn>
        <Btn kind="ghost" onClick={() => { setCapHit(false); setQKey((k) => k + 1); }}>再来几个</Btn>
      </div>
    </Center>
  );

  if (warn) return (
    <Center>
      <p style={{ ...disp, fontWeight: 900, fontSize: 24 }}>Accuracy has dropped below 50%.</p>
      <p style={{ color: C.sub, maxWidth: 420, margin: "8px auto 18px" }}>Extra practice is great — tired practice isn't. Errors made now tend to stick. Recommended: stop here and come back fresh.</p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <Btn kind="good" onClick={onExit}>Stop (recommended)</Btn>
        <Btn kind="ghost" onClick={() => { setWarn(false); setQKey((k) => k + 1); }}>Continue anyway</Btn>
      </div>
    </Center>
  );

  const remain = (state.expressionBook || []).filter((c) => !c.mastered).length;
  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, alignItems: "center" }}>
        <p style={{ ...mono, fontSize: 12, color: C.sub, margin: 0 }}>
          {reviewMode ? `卡池复习 · 待掌握 ${remain} · ${correctCount}/${count} correct` : `FREE · ${LINES[line].name.toUpperCase()} · ${correctCount}/${count} correct`}
        </p>
        <button onClick={onExit} style={{ ...linkBtn, color: C.sub }}>Exit</button>
      </div>
      <QuestionLoader key={qKey} line={line} level={state.levels[line]} state={state} opts={reviewMode ? { forceReview: true } : undefined}
        prefetchNext={reviewMode ? null : { line, level: state.levels[line], revengeTag: null }}>
        {(q) => <QuestionCard q={q} qNum={count + 1} qTotal={"∞"} onDone={handleDone} />}
      </QuestionLoader>
    </div>
  );
}

/* ---------------- 语气速查卡（静态参考，判断标准） ---------------- */
const TONE_GUIDE = [
  {
    intent: "请求别人做事", key: "轻重看你占用对方多少时间",
    levels: [
      ["顺手小事", "Can you send me the file? / Could you take a quick look?"],
      ["占用时间", "Would you be able to review this by Thursday?"],
      ["大忙/跨级", "Would it be possible for you to...? I know it's short notice."],
    ],
    trap: "误区：加 \"please help me...\"（显得像下级求助）；对平级直接用命令式",
  },
  {
    intent: "试探性提议（想听意见）", key: "保留软化词是对的——它们是功能词",
    levels: [
      ["抛选项", "What if we pushed the launch a week? / One option could be..."],
      ["有倾向", "I'm leaning toward Plan B, but curious what you think."],
      ["约讨论", "Can we spend 10 minutes on this in the sync?"],
    ],
    trap: "误区：把试探说成决定（We will push...）——团队以为已拍板",
  },
  {
    intent: "通知已定决策", key: "此时犹豫词才是错误",
    levels: [
      ["直接通知", "We're moving the launch to March 3."],
      ["带背景", "Based on QA findings, we've decided to move the launch to March 3."],
      ["带行动项", "Decision: launch moves to March 3. Action: update your timelines by Friday."],
    ],
    trap: "误区：已拍板还说 \"maybe we should...\"——显得没担当，没人执行",
  },
  {
    intent: "不同意（对上级 / 平级）", key: "先接住对方，再放你的顾虑",
    levels: [
      ["对平级", "I see it differently — my concern is the QA risk."],
      ["对上级", "That makes sense. One thing I'd flag is... / Could we also consider...?"],
      ["强反对", "I'd push back on this one: if we ship Friday, we risk..."],
    ],
    trap: "误区：\"I disagree\" 开头（过硬）；或者干脆不说（过软）",
  },
  {
    intent: "传达坏消息 / 风险", key: "结论先行：出了什么事 → 影响 → 下一步",
    levels: [
      ["IM 快报", "Heads up — we've hit a blocker on X. Impact: ... Next step: ..."],
      ["正式一点", "Flagging a risk: the integration may slip by ~3 days. Mitigation: ..."],
    ],
    trap: "误区：坏消息藏在长段落最后；过度道歉（I'm so sorry but...）",
  },
  {
    intent: "催进度", key: "催的是事，不是人",
    levels: [
      ["轻", "Any update on X?"],
      ["中", "Bumping this — we need it by Friday to stay on track."],
      ["重", "This is now blocking Y. Can we get it today?"],
    ],
    trap: "误区：\"Did you finish?\"（质问感）；催三次不升级方式",
  },
];
function ToneGuide({ onExit }) {
  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <p style={{ ...disp, fontWeight: 900, fontSize: 22, margin: "0 0 4px" }}>语气速查卡</p>
      <p style={{ color: C.sub, fontSize: 13, margin: "0 0 14px" }}>语气没有绝对的对错，只有和意图匹不匹配。先问自己"我此刻想干什么"，再选档位。</p>
      {TONE_GUIDE.map((g, i) => (
        <div key={i} style={{ background: C.surface, borderRadius: 14, padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ ...disp, fontWeight: 700, fontSize: 15, color: C.ink }}>{g.intent}</span>
            <span style={{ fontSize: 12, color: "#7A3EF0" }}>{g.key}</span>
          </div>
          <div style={{ marginTop: 8 }}>
            {g.levels.map(([label, ex], j) => (
              <div key={j} style={{ display: "flex", gap: 10, marginBottom: 6, alignItems: "baseline" }}>
                <span style={{ ...mono, fontSize: 11, color: C.sub, minWidth: 64, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5 }}>{ex}</span>
              </div>
            ))}
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: C.bad }}>{g.trap}</p>
        </div>
      ))}
      <Btn kind="ghost" onClick={onExit}>← Back</Btn>
    </div>
  );
}

/* ---------------- 我的素材 ---------------- */
function Materials({ state, setState, persist, onExit }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const mats = state.materials || { sentences: [], topics: [] };

  async function handleExtract() {
    if (!text.trim() || busy) return;
    setBusy(true); setMsg("");
    try {
      const r = await extractMaterial(text);
      const newSentences = (r.sentences || []).filter((s) => s && s.text)
        .filter((s) => !mats.sentences.some((m) => m.text === s.text))
        .map((s) => ({ text: s.text, why: s.why || "", used: 0 }));
      const newTopics = [...new Set([...(mats.topics || []), ...(r.topics || [])])].slice(0, 10);
      const book = mergeCards(state.expressionBook || [], r.expressions, "material");
      const ns = {
        ...state,
        materials: { sentences: [...mats.sentences, ...newSentences].slice(-40), topics: newTopics },
        expressionBook: book,
      };
      setState(ns); persist(ns);
      setText("");
      setMsg(`✅ 提取完成：难句 ${newSentences.length} 条 · 表达卡 ${(r.expressions || []).length} 张 · 话题 ${(r.topics || []).length} 个`);
    } catch (e) {
      setMsg("提取失败（网络或格式问题），请重试。");
    }
    setBusy(false);
  }
  function clearAll() {
    if (!window.confirm("清空全部素材难句和话题？（已生成的表达卡保留）")) return;
    const ns = { ...state, materials: { sentences: [], topics: [] } };
    setState(ns); persist(ns);
  }

  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <p style={{ ...disp, fontWeight: 900, fontSize: 22, margin: "0 0 4px" }}>我的素材</p>
      <p style={{ color: C.sub, fontSize: 13, margin: "0 0 12px" }}>贴入真实工作材料（PPT 文字 / Slack 消息 / 邮件），AI 提取难句、好表达和你的工作话题——之后约一半的题目会直接来自你的真实语境。</p>
      <div style={{ background: C.amberSoft, borderLeft: `3px solid ${C.amber}`, borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: 12, color: C.ink }}>⚠️ 素材会发送给 AI 服务器出题。涉及机密的客户名、数字、未发布产品，请先手动替换（如"Client A"）。</p>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8}
        placeholder="粘贴英文工作材料（一次一段或几段均可）…"
        style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, border: `2px solid ${C.line}`, padding: 12, fontSize: 14, ...body, resize: "vertical", outline: "none" }} />
      <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
        <Btn onClick={handleExtract} disabled={busy || !text.trim()}>{busy ? "提取中（约20秒）…" : "提取训练素材"}</Btn>
        <Btn kind="ghost" onClick={onExit}>← Back</Btn>
      </div>
      {msg && <p style={{ fontSize: 13, color: C.good, marginTop: 10 }}>{msg}</p>}

      <div style={{ background: C.surface, borderRadius: 14, padding: 18, marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <p style={{ ...mono, fontSize: 11, color: C.sub, margin: "0 0 10px" }}>素材池 — 难句 {mats.sentences.length} 条 · 话题 {(mats.topics || []).length} 个</p>
          {mats.sentences.length > 0 && <button onClick={clearAll} style={{ ...linkBtn, color: C.bad, fontSize: 12 }}>清空</button>}
        </div>
        {(mats.topics || []).length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {mats.topics.map((t, i) => <Tag key={i} tone="accent">{t}</Tag>)}
          </div>
        )}
        {mats.sentences.length === 0 && <p style={{ fontSize: 13, color: C.sub }}>还没有素材。贴入你最近读得费劲的 PPT 或邮件试试。</p>}
        {mats.sentences.map((s, i) => (
          <div key={i} style={{ borderTop: `1px solid ${C.line}`, padding: "8px 0" }}>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: C.ink }}>{s.text}</p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: C.sub }}>{s.why}{s.used ? ` · 已出题 ${s.used} 次` : ""}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Profile ---------------- */
function Profile({ state, onExit, onRetest, onDeleteCard }) {
  const totalErr = Object.values(state.errorMap).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(state.errorMap).sort((a, b) => b[1] - a[1]);
  const book = state.expressionBook || [];
  const masteredCount = book.filter((c) => c.mastered).length;
  const statusTone = { mastered: "good", practiced: "accent", seen: "amber" };
  const statusZh = { mastered: "已掌握", practiced: "练过", seen: "见过" };
  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <p style={{ ...disp, fontWeight: 900, fontSize: 22, margin: "0 0 14px" }}>Weakness Profile</p>
      <div style={{ background: C.surface, borderRadius: 14, padding: 18, marginBottom: 14 }}>
        {LINE_KEYS.map((l) => (
          <div key={l} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ ...disp, fontWeight: 700, fontSize: 15 }}>{LINES[l].name}</span>
              <LevelRail level={state.levels[l]} color={LINES[l].color} />
            </div>
            <p style={{ fontSize: 12, color: C.sub, margin: "3px 0 0" }}>Now: {LEVEL_DESC[l][state.levels[l] - 1]}</p>
          </div>
        ))}
      </div>
      <div style={{ background: C.surface, borderRadius: 14, padding: 18, marginBottom: 14 }}>
        <p style={{ ...mono, fontSize: 11, color: C.sub, margin: "0 0 10px" }}>
          EXPRESSION CARDS 表达卡池 — {book.length} 张 · 已掌握 {masteredCount}
        </p>
        {book.length === 0 && <p style={{ fontSize: 13, color: C.sub }}>还没有卡片。做组句/语域题时，遇到更地道的说法会自动存进来，再通过复习题反复练到掌握。</p>}
        {[...book].sort((a, b) => (a.mastered - b.mastered) || (b.ts - a.ts)).map((c) => {
          const stt = cardStatus(c);
          return (
            <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderTop: `1px solid ${C.line}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ ...disp, fontWeight: 700, fontSize: 14, color: C.ink }}>{c.better}</span>
                  <Tag tone={statusTone[stt]}>{statusZh[stt]} {c.used}/2</Tag>
                </div>
                {c.weak && <p style={{ margin: "2px 0 0", fontSize: 12, color: C.sub }}>弱：{c.weak}</p>}
                {c.note && <p style={{ margin: "2px 0 0", fontSize: 12, color: C.sub }}>· {c.note}</p>}
              </div>
              <button onClick={() => onDeleteCard && onDeleteCard(c.id)} title="删除这张卡片"
                style={{ ...linkBtn, color: C.sub, fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
          );
        })}
      </div>
      <div style={{ background: C.surface, borderRadius: 14, padding: 18, marginBottom: 14 }}>
        <p style={{ ...mono, fontSize: 11, color: C.sub, margin: "0 0 10px" }}>ERROR MAP — {totalErr} logged</p>
        {sorted.length === 0 && <p style={{ fontSize: 13, color: C.sub }}>No errors logged yet. They'll appear here and drive your revenge questions.</p>}
        {sorted.map(([tag, n]) => (
          <div key={tag} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
            <span style={{ ...mono, fontSize: 11, minWidth: 130, color: C.ink }}>{tag}</span>
            <div style={{ flex: 1, height: 8, background: C.bg, borderRadius: 4 }}>
              <div style={{ width: `${(n / sorted[0][1]) * 100}%`, height: "100%", background: C.bad, borderRadius: 4 }} />
            </div>
            <span style={{ ...mono, fontSize: 11, color: C.sub }}>{n}</span>
          </div>
        ))}
      </div>
      <div style={{ background: C.surface, borderRadius: 14, padding: 18, marginBottom: 14 }}>
        <p style={{ ...mono, fontSize: 11, color: C.sub, margin: "0 0 10px" }}>
          DECODE STRUCTURES — {STRUCT_KEYS.filter((k) => structMastered((state.structMastery || {})[k])).length}/{STRUCT_KEYS.length} internalized
        </p>
        {STRUCT_KEYS.map((k) => {
          const m = (state.structMastery || {})[k];
          const acc = m && m.seen ? m.correct / m.seen : null;
          const done = structMastered(m);
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
              <span style={{ fontSize: 12, minWidth: 150, color: C.ink }}>{STRUCTURES[k].zh}</span>
              <div style={{ flex: 1, height: 8, background: C.bg, borderRadius: 4 }}>
                <div style={{ width: `${acc == null ? 0 : acc * 100}%`, height: "100%", background: done ? C.good : C.accent, borderRadius: 4 }} />
              </div>
              <span style={{ ...mono, fontSize: 11, color: done ? C.good : C.sub, minWidth: 64, textAlign: "right" }}>
                {m && m.seen ? `${m.correct}/${m.seen}${done ? " ✓" : ""}` : "未遇到"}
              </span>
            </div>
          );
        })}
        <p style={{ fontSize: 11, color: C.sub, margin: "8px 0 0" }}>✓ = 已内化（见过≥4次且正确率≥75%）。超出当前等级范围的结构暂不出现。</p>
      </div>
      <div style={{ background: C.surface, borderRadius: 14, padding: 18, marginBottom: 14 }}>
        <p style={{ ...mono, fontSize: 11, color: C.sub, margin: "0 0 10px" }}>WRONG BOOK — {(state.wrongBook || []).length} 条（显示最近 10 条，定期回看是免费的复习）</p>
        {(state.wrongBook || []).length === 0 && <p style={{ fontSize: 13, color: C.sub }}>还没有错题。答错的题目会完整记录在这里。</p>}
        {[...(state.wrongBook || [])].reverse().slice(0, 10).map((w, i) => (
          <div key={i} style={{ borderTop: i === 0 ? "none" : `1px solid ${C.line}`, padding: "10px 0" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              <Tag>{LINES[w.line] ? LINES[w.line].name : w.line} L{w.level}</Tag>
              {w.structKey && STRUCTURES[w.structKey] && <Tag tone="amber">{STRUCTURES[w.structKey].zh}</Tag>}
              {w.timedOut && <Tag tone="bad">超时</Tag>}
              <span style={{ ...mono, fontSize: 10, color: C.sub, alignSelf: "center" }}>{w.date}{w.timeUsed != null ? ` · 用时${w.timeUsed}/${w.timeLimit}s` : ""}</span>
            </div>
            <p style={{ margin: "0 0 4px", fontSize: 13, lineHeight: 1.5, color: C.ink }}>{w.question}</p>
            <p style={{ margin: "0 0 2px", fontSize: 12, color: C.bad }}>你的答案：{w.userAnswer}</p>
            <p style={{ margin: "0 0 2px", fontSize: 12, color: C.good }}>参考：{w.reference}</p>
            {(w.issues || []).map((iss, j) => (
              <p key={j} style={{ margin: 0, fontSize: 12, color: C.sub }}>· [{iss.tag}] {iss.hint}</p>
            ))}
          </div>
        ))}
      </div>
      <div style={{ background: C.surface, borderRadius: 14, padding: 18, marginBottom: 14 }}>
        <p style={{ ...mono, fontSize: 11, color: C.sub, margin: "0 0 10px" }}>FLUENCY 流利度 — 同等级内的 wpm 变化（词数/用时，消除句长噪声；参考：母语者阅读约 200-250 wpm）</p>
        {LINE_KEYS.map((l) => {
          const lvNow = state.levels[l];
          const logs = (state.speedLog || []).filter((e) => e.line === l && e.ok && e.wc && e.sec >= 1 && e.lv === lvNow);
          if (logs.length < 6) return <p key={l} style={{ fontSize: 12, color: C.sub, margin: "0 0 6px" }}>{LINES[l].name} L{lvNow}：样本不足（当前等级答对 ≥6 道限时题后显示）</p>;
          const wpm = (a) => Math.round(a.reduce((s, e) => s + (e.wc / e.sec) * 60, 0) / a.length);
          const recent = logs.slice(-12), prev = logs.slice(-24, -12);
          const r = wpm(recent), p = prev.length >= 6 ? wpm(prev) : null;
          const delta = p != null ? r - p : null;
          return (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
              <span style={{ fontSize: 12, minWidth: 96, color: C.ink }}>{LINES[l].name} L{lvNow}</span>
              <span style={{ fontSize: 12, color: C.sub }}>{l === "decode" ? "阅读" : "产出"}</span>
              <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: C.ink, marginLeft: "auto" }}>{r} wpm</span>
              <span style={{ ...mono, fontSize: 11, minWidth: 44, textAlign: "right", color: delta == null ? C.sub : delta > 0 ? C.good : delta < 0 ? C.amber : C.sub }}>
                {delta != null ? (delta > 0 ? `↑${delta}` : delta < 0 ? `↓${-delta}` : "→") : ""}
              </span>
            </div>
          );
        })}
      </div>
      {((state.placementHistory || []).length > 0 || (state.examHistory || []).length > 0) && (
        <div style={{ background: C.surface, borderRadius: 14, padding: 18, marginBottom: 14 }}>
          <p style={{ ...mono, fontSize: 11, color: C.sub, margin: "0 0 8px" }}>BASELINE — 水平测试与摸底历史（每 4 周一次，进步有据可查）</p>
          {(state.examHistory || []).map((h, i) => (
            <p key={"e" + i} style={{ ...mono, fontSize: 12, color: C.ink, margin: "0 0 4px" }}>
              📋 {h.date} · D {h.lines.decode.acc}%{h.lines.decode.wpm ? `/${h.lines.decode.wpm}wpm` : ""} · R {h.lines.register.acc}% · B {h.lines.build.acc}%{h.lines.build.wpm ? `/${h.lines.build.wpm}wpm` : ""}
            </p>
          ))}
          {(state.placementHistory || []).map((h, i) => (
            <p key={"p" + i} style={{ ...mono, fontSize: 12, color: C.sub, margin: "0 0 4px" }}>
              摸底 {h.date} · D{h.levels.decode} / R{h.levels.register} / B{h.levels.build}
            </p>
          ))}
          {(state.selfChecks || []).length > 0 && (
            <p style={{ fontSize: 12, color: C.sub, margin: "8px 0 0" }}>
              每周体感：{(state.selfChecks || []).slice(-8).map((c) => ["", "😣", "😐", "😊"][c.score]).join(" ")}
            </p>
          )}
        </div>
      )}
      <div style={{ background: C.surface, borderRadius: 14, padding: 18, marginBottom: 16 }}>
        <p style={{ ...mono, fontSize: 11, color: C.sub, margin: "0 0 8px" }}>SESSIONS — {state.sessions.length} completed</p>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {state.sessions.slice(-21).map((s, i) => (
            <div key={i} title={`${s.date}: ${s.correct}/${s.total}`} style={{
              width: 18, height: 18, borderRadius: 5,
              background: s.correct / s.total >= 0.7 ? C.good : s.correct / s.total >= 0.4 ? C.amber : C.bad, opacity: 0.85,
            }} />
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn kind="ghost" onClick={onExit}>← Back</Btn>
        <Btn kind="ghost" onClick={onRetest}>Retake placement (recalibrate)</Btn>
      </div>
    </div>
  );
}

/* ---------------- 考试模式：独立于日常训练的水平测量 ---------------- */
// 素颜应试：无脚手架/无复习卡/无即时反馈；含迁移题（邮件体裁，测"没练过的格式"）；
// 结果只写 examHistory，不影响等级/SRS/卡池——测量与训练严格分离
function ExamMode({ state, setState, persist, onExit }) {
  const [view, setView] = useState("intro"); // intro | run | report
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState([]);
  const [qKey, setQKey] = useState(0);
  // 12 题 = 三线交错 ×4 轮；第 4 轮解码为邮件体裁迁移题
  const plan = [];
  for (let r = 0; r < 4; r++) {
    plan.push({ line: "decode", opts: { exam: true, genre: r === 3 ? "email" : undefined } });
    plan.push({ line: "register", opts: { exam: true } });
    plan.push({ line: "build", opts: { exam: true } });
  }
  const slot = plan[idx];

  function handleDone(res) {
    const nr = [...results, { line: res.line, correct: res.correct, score: res.score, timeUsed: res.timeUsed, timeLimit: res.timeLimit, wc: res.wc, wrong: res.wrongEntry || null }];
    setResults(nr);
    if (idx + 1 < plan.length) { setIdx(idx + 1); setQKey((k) => k + 1); return; }
    // 交卷：生成成绩单并存档
    const lines = {};
    LINE_KEYS.forEach((l) => {
      const rs = nr.filter((r) => r.line === l);
      const okRs = rs.filter((r) => r.correct && r.wc && r.timeUsed >= 1);
      lines[l] = {
        lv: state.levels[l],
        acc: rs.length ? Math.round((rs.filter((r) => r.correct).length / rs.length) * 100) : 0,
        wpm: okRs.length ? Math.round(okRs.reduce((s, r) => s + (r.wc / r.timeUsed) * 60, 0) / okRs.length) : null,
      };
    });
    const rec = { date: new Date().toISOString().slice(0, 10), lines };
    const ns = { ...state, examHistory: [...(state.examHistory || []), rec] };
    setState(ns); persist(ns);
    setView("report");
  }

  if (view === "intro") return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <p style={{ ...disp, fontWeight: 900, fontSize: 22, margin: "0 0 8px" }}>📋 水平测试</p>
      <div style={{ background: C.surface, borderRadius: 14, padding: 18, marginBottom: 14 }}>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: C.ink, margin: 0 }}>
          12 道题，约 15 分钟。和日常训练不同：<b>没有脚手架、没有复习题、做完才看结果</b>，还有一道你没练过的题型（读邮件抓要点）——测的是迁移，不是熟练。
          成绩单会存档，和上次并排对比。这是回答"我到底有没有变强"的唯一可信仪器，别在疲劳时做。
        </p>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn onClick={() => setView("run")}>开始测试 →</Btn>
        <Btn kind="ghost" onClick={onExit}>← Back</Btn>
      </div>
    </div>
  );

  if (view === "report") {
    const hist = state.examHistory || [];
    const cur = hist[hist.length - 1];
    const prev = hist.length >= 2 ? hist[hist.length - 2] : null;
    const wrongs = results.filter((r) => r.wrong);
    return (
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <p style={{ ...disp, fontWeight: 900, fontSize: 22, margin: "0 0 8px" }}>成绩单 · {cur.date}</p>
        <div style={{ background: C.surface, borderRadius: 14, padding: 18, marginBottom: 14 }}>
          {LINE_KEYS.map((l) => {
            const c = cur.lines[l]; const p = prev ? prev.lines[l] : null;
            const dAcc = p ? c.acc - p.acc : null;
            const dWpm = p && p.wpm != null && c.wpm != null ? c.wpm - p.wpm : null;
            return (
              <div key={l} style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
                <span style={{ ...disp, fontWeight: 700, fontSize: 15, minWidth: 78 }}>{LINES[l].name}</span>
                <span style={{ ...mono, fontSize: 12, color: C.sub }}>L{c.lv}</span>
                <span style={{ ...mono, fontSize: 14, fontWeight: 700, color: C.ink }}>{c.acc}%</span>
                {dAcc != null && <span style={{ ...mono, fontSize: 11, color: dAcc > 0 ? C.good : dAcc < 0 ? C.bad : C.sub }}>{dAcc > 0 ? `↑${dAcc}` : dAcc < 0 ? `↓${-dAcc}` : "→"}</span>}
                {c.wpm != null && <span style={{ ...mono, fontSize: 12, color: C.sub, marginLeft: "auto" }}>{c.wpm} wpm{dWpm != null ? (dWpm > 0 ? ` ↑${dWpm}` : dWpm < 0 ? ` ↓${-dWpm}` : "") : ""}</span>}
              </div>
            );
          })}
          {!prev && <p style={{ fontSize: 12, color: C.sub, margin: "6px 0 0" }}>这是你的第一份正式基线。4 周后再考一次，对比就有了。</p>}
        </div>
        {wrongs.length > 0 && (
          <div style={{ background: C.surface, borderRadius: 14, padding: 18, marginBottom: 14 }}>
            <p style={{ ...mono, fontSize: 11, color: C.sub, margin: "0 0 10px" }}>本次错题（{wrongs.length} 道，仅供复盘，不进错题本）</p>
            {wrongs.map((r, i) => (
              <div key={i} style={{ borderTop: `1px solid ${C.line}`, padding: "8px 0" }}>
                <p style={{ margin: 0, fontSize: 13, color: C.ink, lineHeight: 1.5 }}>{r.wrong.question}</p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: C.bad }}>你：{r.wrong.userAnswer}</p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: C.good }}>参考：{r.wrong.reference}</p>
              </div>
            ))}
          </div>
        )}
        <Btn onClick={onExit}>完成</Btn>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, alignItems: "center" }}>
        <p style={{ ...mono, fontSize: 12, color: C.sub, margin: 0 }}>EXAM · 反馈将在交卷后统一给出</p>
        <button onClick={onExit} style={{ ...linkBtn, color: C.sub }}>放弃本次</button>
      </div>
      <QuestionLoader key={qKey} line={slot.line} level={state.levels[slot.line]} state={state} opts={slot.opts}
        prefetchNext={idx + 1 < plan.length ? { line: plan[idx + 1].line, level: state.levels[plan[idx + 1].line], revengeTag: null, opts: plan[idx + 1].opts } : null}>
        {(q) => <QuestionCard q={q} qNum={idx + 1} qTotal={plan.length} onDone={handleDone} silent />}
      </QuestionLoader>
    </div>
  );
}

/* ---------------- 密钥设置（线上版首次使用） ---------------- */
function KeySetup({ onDone }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ minHeight: "100vh", background: C.bg, ...body, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <style>{FONT}</style>
      <div style={{ background: C.surface, borderRadius: 16, padding: 28, maxWidth: 440 }}>
        <p style={{ ...disp, fontWeight: 900, fontSize: 20, margin: "0 0 8px" }}>输入你的 DeepSeek 密钥</p>
        <p style={{ fontSize: 13, color: C.sub, margin: "0 0 6px", lineHeight: 1.6 }}>
          出题和判分由 DeepSeek 完成，需要你自己的 API 密钥（sk- 开头）。没有的话去 platform.deepseek.com → API keys 创建。
        </p>
        <p style={{ fontSize: 12, color: C.sub, margin: "0 0 14px", lineHeight: 1.6 }}>
          🔒 密钥只保存在你这台设备的浏览器里，不会上传到任何地方。每台新设备首次使用时输入一次即可。
        </p>
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="sk-..."
          style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, border: `2px solid ${C.line}`, padding: "12px 14px", fontSize: 14, ...mono, outline: "none" }} />
        <div style={{ marginTop: 14 }}>
          <Btn disabled={!val.trim().startsWith("sk-")} onClick={() => {
            try { localStorage.setItem("wec_api_key", val.trim()); } catch (e) {}
            onDone();
          }}>开始使用 →</Btn>
        </div>
      </div>
    </div>
  );
}

/* ---------------- App ---------------- */
export default function App() {
  const [state, setState] = useState(null);
  const [view, setView] = useState("home");
  const [hasKey, setHasKey] = useState(() => !!getApiKey());

  useEffect(() => {
    loadState().then(async (s) => {
      let cur = s;
      // 已开启云同步：启动时拉云端，谁新用谁（时间戳判定）
      if (getGhToken()) {
        try {
          if (!getGistId()) await cloudFindOrCreate(s);
          const cloud = await cloudPull();
          // 防呆：云端更"新"但明显更空（0 个 session 而本机有）→ 保本机，防止空进度覆盖真实进度
          const cloudEmpty = cloud && !((cloud.sessions || []).length) && ((s.sessions || []).length > 0 || s.placementDone);
          if (cloud && !cloudEmpty && (cloud.updatedAt || 0) > (s.updatedAt || 0)) { cur = { ...DEFAULT_STATE, ...cloud }; saveState(cur); }
        } catch (e) { /* 云端不可达时静默用本地 */ }
      }
      setState(cur); if (!cur.placementDone) setView("placement");
    });
  }, []);
  const persist = useCallback((s) => {
    const stamped = { ...s, updatedAt: Date.now() };
    saveState(stamped);
    cloudPushDebounced(stamped); // 未开启云同步时内部直接跳过
  }, []);

  if (!hasKey) return <KeySetup onDone={() => setHasKey(true)} />; // 必须放在所有 hooks 之后

  if (!state) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{FONT}</style>
      <p style={{ ...mono, color: C.sub }}>Loading your profile…</p>
    </div>
  );

  function placementDone(levels) {
    // 基线入史册：每次摸底/重测的结果永久保存，"我比一个月前强了吗"从此有据可查
    const rec = { date: new Date().toISOString().slice(0, 10), levels: { ...levels } };
    const ns = { ...state, placementDone: true, levels: { ...levels }, placementHistory: [...(state.placementHistory || []), rec] };
    setState(ns); persist(ns); setView("home");
  }
  function saveSelfCheck(score) {
    const ns = { ...state, selfChecks: [...(state.selfChecks || []), { date: new Date().toISOString().slice(0, 10), score }] };
    setState(ns); persist(ns);
  }
  function retest() {
    const ns = { ...state, placementDone: false };
    setState(ns); persist(ns); setView("placement");
  }
  function deleteCard(id) {
    const ns = { ...state, expressionBook: (state.expressionBook || []).filter((c) => c.id !== id) };
    setState(ns); persist(ns);
  }

  const weakest = weakestLine(state);

  function exportProgress() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `english-coach-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function importProgress(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.levels || !data.streaks) throw new Error("bad file");
        const ns = { ...DEFAULT_STATE, ...data };
        setState(ns); persist(ns);
        alert("进度导入成功！");
      } catch {
        alert("导入失败：这不是有效的进度文件");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, ...body, color: C.ink, padding: "20px 16px 60px" }}>
      <style>{FONT + `@keyframes slide{0%{margin-left:-40%}100%{margin-left:100%}} textarea:focus{border-color:${C.accent} !important}`}</style>

      <header style={{ maxWidth: 620, margin: "0 auto 22px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <p style={{ ...disp, fontWeight: 900, fontSize: 17, margin: 0, letterSpacing: -0.3 }}>WORKPLACE ENGLISH <span style={{ color: C.accent }}>COACH</span></p>
          <p style={{ ...mono, fontSize: 10, color: C.sub, margin: 0, letterSpacing: 1 }}>DELIBERATE PRACTICE ENGINE</p>
        </div>
        {state.placementDone && view === "home" && (
          <button onClick={() => setView("profile")} style={{ ...linkBtn, fontSize: 13 }}>Profile</button>
        )}
      </header>

      {view === "placement" && <Placement state={state} setState={setState} onDone={placementDone} />}
      {view === "session" && <Session state={state} setState={setState} persist={persist} onExit={() => setView("home")} />}
      {view === "free" && <FreePractice state={state} setState={setState} persist={persist} onExit={() => setView("home")} />}
      {view === "review" && <FreePractice state={state} setState={setState} persist={persist} onExit={() => setView("home")} reviewMode />}
      {view === "materials" && <Materials state={state} setState={setState} persist={persist} onExit={() => setView("home")} />}
      {view === "toneguide" && <ToneGuide onExit={() => setView("home")} />}
      {view === "exam" && <ExamMode state={state} setState={setState} persist={persist} onExit={() => setView("home")} />}
      {view === "profile" && <Profile state={state} onExit={() => setView("home")} onRetest={retest} onDeleteCard={deleteCard} />}

      {view === "home" && (
        <div style={{ maxWidth: 620, margin: "0 auto" }}>
          <div style={{ background: C.surface, borderRadius: 16, padding: 22, marginBottom: 14 }}>
            <p style={{ ...mono, fontSize: 11, color: C.sub, margin: "0 0 12px" }}>YOUR THREE LINES</p>
            {LINE_KEYS.map((l) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <span style={{ ...disp, fontWeight: 700, fontSize: 15 }}>{LINES[l].name}</span>
                  {l === weakest && <span style={{ marginLeft: 8 }}><Tag tone="amber">PRIORITY</Tag></span>}
                  <p style={{ fontSize: 12, color: C.sub, margin: "2px 0 0" }}>{LINES[l].goal}</p>
                </div>
                <LevelRail level={state.levels[l]} color={LINES[l].color} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Btn onClick={() => setView("session")}>Start today's session →</Btn>
            <Btn kind="ghost" onClick={() => setView("free")}>Free practice</Btn>
            <Btn kind="ghost" onClick={() => setView("review")}>
              复习卡池{(state.expressionBook || []).filter(isDue).length ? ` (${(state.expressionBook || []).filter(isDue).length} 到期)` : ""}
            </Btn>
            <Btn kind="ghost" onClick={() => setView("materials")}>
              我的素材{((state.materials || {}).sentences || []).length ? ` (${state.materials.sentences.length})` : ""}
            </Btn>
            <Btn kind="ghost" onClick={() => setView("toneguide")}>语气速查</Btn>
            <Btn kind="ghost" onClick={() => setView("exam")}>📋 水平测试{(state.examHistory || []).length === 0 ? "（建基线）" : ""}</Btn>
          </div>
          {(() => {
            const dc = (state.expressionBook || []).filter(isDue).length;
            const dw = (state.wrongBook || []).filter((w) => w.id && isDue(w)).length;
            const total = dc + dw;
            if (total === 0) return null;
            const today = Math.min(total, 8); // 每日消化上限，其余顺延——积压是排队不是债务
            return (
              <p style={{ fontSize: 13, color: C.amber, marginTop: 14, fontWeight: 600 }}>
                📅 今日安排复习 {today} 项{total > today ? `（另有 ${total - today} 项自动顺延，不用着急）` : ""}——做 session 或点复习卡池即可消化
              </p>
            );
          })()}
          {(() => {
            // 每周自评：系统内唯一刷不了的指标——真实工作里的体感
            const last = (state.selfChecks || []).slice(-1)[0];
            const daysSince = last ? (Date.now() - new Date(last.date).getTime()) / (24 * 3600 * 1000) : 99;
            if ((state.sessions || []).length === 0 || daysSince < 7) return null;
            return (
              <div style={{ background: C.surface, borderRadius: 12, padding: 14, marginTop: 14 }}>
                <p style={{ fontSize: 13, color: C.ink, margin: "0 0 8px", fontWeight: 600 }}>📊 每周一问：这周在工作里读/写英文的体感？</p>
                <div style={{ display: "flex", gap: 8 }}>
                  {[["更吃力", 1], ["没变化", 2], ["更顺了", 3]].map(([label, v]) => (
                    <button key={v} onClick={() => saveSelfCheck(v)} style={{ flex: 1, padding: "8px 6px", borderRadius: 8, cursor: "pointer", fontSize: 13, ...body, border: `2px solid ${C.line}`, background: "#fff", color: C.ink }}>{label}</button>
                  ))}
                </div>
              </div>
            );
          })()}
          {(() => {
            // 4 周考试提醒 + 每月判分审计提示
            const exams = state.examHistory || [];
            const lastDate = exams.length ? exams[exams.length - 1].date : ((state.sessions || [])[0] || {}).date;
            if (!lastDate) return null;
            const days = Math.floor((Date.now() - new Date(lastDate).getTime()) / (24 * 3600 * 1000));
            if (exams.length && days < 28) return null;
            return (
              <p style={{ fontSize: 12.5, color: C.sub, marginTop: 10 }}>
                {exams.length === 0
                  ? "📋 你还没有正式基线——找个状态好的时候做一次「水平测试」，四周后的对比从它开始。"
                  : `🔁 距上次水平测试已 ${days} 天——该考一次了；顺便把导出的进度丢给 Claude 复核一轮判分质量。`}
              </p>
            );
          })()}
          {getGhToken() && (() => {
            // 同步不再静默：显示上次同步时间，失败变红
            let lastSync = 0, err = false;
            try { lastSync = parseInt(localStorage.getItem("wec_last_sync") || "0", 10); err = !!localStorage.getItem("wec_sync_err"); } catch (e) {}
            const mins = lastSync ? Math.floor((Date.now() - lastSync) / 60000) : null;
            return (
              <p style={{ ...mono, fontSize: 11, color: err ? C.bad : C.sub, marginTop: 10 }}>
                {err ? "⚠️ 云同步失败——检查网络或令牌是否失效" : mins == null ? "云同步已开启，等待首次同步" : `云同步正常 · 上次 ${mins < 1 ? "刚刚" : mins + " 分钟前"}`}
              </p>
            );
          })()}
          {state.sessions.length > 0 && (
            <p style={{ ...mono, fontSize: 11, color: C.sub, marginTop: 6 }}>
              {state.sessions.length} sessions done · last: {state.sessions[state.sessions.length - 1].date}
            </p>
          )}
          <div style={{ display: "flex", gap: 16, marginTop: 18, alignItems: "center" }}>
            <button onClick={exportProgress} style={linkBtn}>导出进度</button>
            <label style={{ ...linkBtn, cursor: "pointer" }}>
              导入进度
              <input type="file" accept=".json" onChange={importProgress} style={{ display: "none" }} />
            </label>
            <button style={{ ...linkBtn, color: C.sub }} onClick={() => {
              const k = window.prompt("粘贴新的 DeepSeek API 密钥（sk- 开头）：");
              if (k && k.trim().startsWith("sk-")) { try { localStorage.setItem("wec_api_key", k.trim()); alert("已更换"); } catch (e) {} }
            }}>更换密钥</button>
            <button style={{ ...linkBtn, color: getGhToken() ? C.good : C.accent }} onClick={async () => {
              const t = window.prompt("粘贴 GitHub 令牌（ghp_ 开头，只需勾选 gist 权限）。\n获取：GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token，勾选 gist。", "");
              if (!t || !t.trim()) return;
              try { localStorage.setItem("wec_gh_token", t.trim()); } catch (e) {}
              try {
                await cloudFindOrCreate(state);
                const cloud = await cloudPull();
                const cloudEmpty = cloud && !((cloud.sessions || []).length) && ((state.sessions || []).length > 0 || state.placementDone);
                if (cloud && !cloudEmpty && (cloud.updatedAt || 0) > (state.updatedAt || 0)) {
                  const ns = { ...DEFAULT_STATE, ...cloud };
                  setState(ns); saveState(ns);
                  alert("云同步已开启 ✅ 已拉取云端最新进度");
                } else {
                  cloudPushDebounced({ ...state, updatedAt: Date.now() });
                  alert("云同步已开启 ✅ 本机进度已上传");
                }
              } catch (e) {
                try { localStorage.removeItem("wec_gh_token"); } catch (e2) {}
                alert("开启失败：请检查令牌是否正确、是否勾选了 gist 权限");
              }
            }}>{getGhToken() ? "云同步 ✓" : "开启云同步"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
