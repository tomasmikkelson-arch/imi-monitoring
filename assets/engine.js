/*
 * ІМІ · Моніторинг згадок — детермінований рушій аналізу вивантаження Looqme.
 *
 * Один і той самий файл завжди дає той самий результат: жодної випадковості,
 * сортування стабільні, рішення ухвалюються лише закритими правилами нижче.
 * Методологія — за аналітичним промптом ІМІ (охоплення лише з переглядів матеріалу,
 * шум за закритим переліком, згортання дублів, owned / earned / проєктні плашки).
 *
 * Працює і в браузері (window.IMIEngine), і в Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.IMIEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ENGINE_VERSION = "2.0.0";

  /* ───────────────────────── текстові утиліти ───────────────────────── */

  function norm(s) {
    if (s == null) return "";
    if (typeof s === "number" && !Number.isFinite(s)) return "";
    const t = String(s);
    if (t === "nan" || t === "NaN" || t === "undefined" || t === "null") return "";
    return t.replace(/ /g, " ").replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim();
  }
  function low(s) {
    return norm(s).toLowerCase().replace(/[ʼ’`]/g, "'").replace(/ё/g, "е");
  }
  function num(v) {
    if (v == null || v === "") return 0;
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  const LETTER = "a-zа-яіїєґё0-9";
  const WB_L = "(?<![" + LETTER + "])";
  const WB_R = "(?![" + LETTER + "])";

  /* Дата й час: рядок «2026-10-25», Date або серійне число Excel. Без часових поясів. */
  function toISODate(v) {
    if (v == null || v === "") return "";
    if (v instanceof Date && !isNaN(v)) {
      const y = v.getFullYear(), m = v.getMonth() + 1, d = v.getDate();
      return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      const ms = Math.round((v - 25569) * 86400000);
      return new Date(ms).toISOString().slice(0, 10);
    }
    const s = norm(v);
    let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[0];
    m = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
    return s.slice(0, 10);
  }
  function toTime(v) {
    if (v == null || v === "") return "";
    if (typeof v === "number" && Number.isFinite(v)) {
      const frac = v - Math.floor(v);
      const secs = Math.round(frac * 86400);
      const h = Math.floor(secs / 3600), mi = Math.floor((secs % 3600) / 60);
      return String(h).padStart(2, "0") + ":" + String(mi).padStart(2, "0");
    }
    if (v instanceof Date && !isNaN(v)) return String(v.getHours()).padStart(2, "0") + ":" + String(v.getMinutes()).padStart(2, "0");
    const m = norm(v).match(/(\d{1,2}):(\d{2})/);
    return m ? m[1].padStart(2, "0") + ":" + m[2] : "";
  }

  /* ───────────────────────── згадка ІМІ ───────────────────────── */

  // Повна назва / Медіабаза — регістр не важливий, відмінки враховано.
  const RE_FULL = new RegExp(
    [
      "інститут[а-яіїєґ']{0,4}\\s+масов",
      "институт[а-яё]{0,4}\\s+массов",
      "institute\\s+of\\s+mass",
      "медіабаз", "медиабаз", "mediabaza",
      "imiukraine", "imi\\.org\\.ua"
    ].join("|"), "gi");
  // Абревіатура — лише великими літерами (ІМІ / IMI / ИМИ, змішані латиниця й кирилиця).
  // Так відсікаються «з імі» (білоруське «з ними»), «імі франка» з автотранскриптів тощо.
  const RE_ABBR = /(?<![A-Za-zА-Яа-яІіЇїЄєҐґЁё0-9])[IІИ][MМ][IІИ](?![A-Za-zА-Яа-яІіЇїЄєҐґЁё0-9])/g;
  const RE_ABBR_ANYCASE = /(?<![A-Za-zА-Яа-яІіЇїЄєҐґЁё0-9])[IІИiіи][MМmм][IІИiіи](?![A-Za-zА-Яа-яІіЇїЄєҐґЁё0-9])/g;

  function findMentions(text) {
    const out = [];
    if (!text) return out;
    let m;
    RE_FULL.lastIndex = 0;
    while ((m = RE_FULL.exec(text))) out.push({ i: m.index, len: m[0].length });
    RE_ABBR.lastIndex = 0;
    while ((m = RE_ABBR.exec(text))) out.push({ i: m.index, len: m[0].length });
    out.sort((a, b) => a.i - b.i);
    return out;
  }
  function hasLowercaseOnlyAbbr(text) {
    RE_ABBR_ANYCASE.lastIndex = 0;
    return RE_ABBR_ANYCASE.test(text || "");
  }

  /* Формула проєктної / донорської плашки: «матеріал створено в межах проєкту ІМІ за підтримки…»,
     «діяльність … здійснюється за підтримки ІМІ», «не відображає офіційну позицію ІМІ». */
  const PLATE_RES = [
    /(в|у)\s+межах\s+([^\s]+\s+){0,3}проє?кт/,
    /в\s+рамках\s+([^\s]+\s+){0,3}проект/,
    /as\s+part\s+of\s+(a|the)\s+([^\s]+\s+){0,2}project/,
    /(не\s+відобража|не\s+отража|does\s+not\s+(necessarily\s+)?reflect)/,
    /(створен|підготовлен|виготовлен|здійсню|реалізу|создан|подготовлен|осуществля|реализу|produced|created|prepared|працює|работает)[^.!?]{0,60}(за\s+(фінансової\s+)?підтримк|при\s+(финансовой\s+)?поддержк|with\s+the\s+(financial\s+)?support)/,
    /(діяльність|деятельность|activit)[^.!?]{0,80}(підтримк|поддержк|support)/
  ];
  function isPlateMention(text, pos) {
    let pre = low(text.slice(Math.max(0, pos - 170), pos));
    // відрізаємо попередні речення (крапка/знак питання/оклику + пробіл або новий рядок)
    const cut = Math.max(pre.lastIndexOf(". "), pre.lastIndexOf("! "), pre.lastIndexOf("? "), pre.lastIndexOf("\n"), pre.lastIndexOf("|"));
    if (cut >= 0) pre = pre.slice(cut + 1);
    return PLATE_RES.some(re => re.test(pre));
  }

  /* ───────────────────────── теми (кластери) ─────────────────────────
     Стабільна таксономія за продуктами й напрямами ІМІ. Тема визначається за тим,
     на який текст / напрям ІМІ посилається матеріал: аналізується контекст навколо
     кожної згадки (±220 знаків, вага 2) і заголовок з анотацією (вага 1). */
  const W = (s) => new RegExp(s, "i");
  const THEMES = [
    { id: "map", name: "Мапа рекомендованих медіа", strong: [W("мап[а-яії]*\\s+рекомендован")], res: [W("мап[а-яії]*\\s+рекомендован"), W("карт[а-я]*\\s+рекомендован"), W("recommended\\s+media")] },
    { id: "standards", name: "Моніторинг професійних стандартів («білий список»)", strong: [W("біл[а-яії]+\\s+списк"), W("найякісніш"), W("(дотрим|відповідн)[а-яії]*\\s+([а-яії]+\\s+){0,2}(журналістськ|професійн)[а-яії]*\\s+стандарт")], res: [W("стандарт"), W("біл[а-яії]+\\s+списк"), W("бел[а-я]+\\s+списк"), W("найякісніш"), W("самых\\s+качественн"), W("найвищ[а-яії]*\\s+рів[а-яії]*\\s+(дотрим|відповідн)"), W("рейтинг[а-яії]*\\s+(медіа|онлайн|імі|сайт)"), W("якісн[а-яії]*\\s+(і|та)\\s+відповідальн"), W("відповідн[а-яії]*\\s+журналістськ")] },
    { id: "barometer", name: "Барометр свободи слова: порушення і тиск на медіа", strong: [W("барометр"), W("(порушен|нарушени)[а-яії]*\\s+свобод[а-яії]*\\s+слова")], res: [W("барометр"), W("(порушен|нарушени|обмежен|утиск)[а-яії]*\\s+свобод[а-яії]*\\s+слова"), W("violations?\\s+of\\s+(the\\s+)?freedom"), W("перешкоджан"), W("погрож"), W("залякуван"), W("тиск[а-я]*\\s+на\\s+(журналіст|медіа|редакц|видан)"), W("slapp"), W("позов"), W("медіаюрист")] },
    { id: "crimes", name: "Злочини Росії проти медіа", strong: [W("\\d+\\s*злочин"), W("злочин[а-яії]*\\s+(росії\\s+|рф\\s+)?проти\\s+(журналіст|медіа)")], res: [W("\\d+\\s*злочин"), W("злочин[а-яії]*\\s+(росії|рф|проти|російськ)"), W("преступлен[а-я]*\\s+(росси|рф|против)"), W("crimes?\\s+against"), W("(сотн|тисяч|дев'ятсот|вісімсот)[а-яії]*\\s+злочин"), W("скоїла\\s+\\S*\\s*злочин")] },
    { id: "killed", name: "Загиблі й померлі медійники та партнери", strongHead: [W("помер|загин|загибел|погиб|умер|пішов\\s+із\\s+життя|зупинилося\\s+серце|вічна\\s+пам")], res: [W("загин"), W("загибел"), W("загибл"), W("помер"), W("вбил"), W("вбит"), W("погиб"), W("killed"), W("вічна\\s+пам"), W("став\\s+\\S+\\s+(\\S+\\s+)?медійник"), W("медійник[а-яії]*,?\\s+як[а-яії]*\\s+загин"), W("rec?вієм|реквієм")] },
    { id: "safety", name: "Безпека журналістів і атаки на редакції", res: [W("безпек"), W("дрон"), W("fpv"), W("press"), W("обстріл"), W("атак"), W("удар[а-яії]*\\s+(по|в)\\s+(редакц|телеканал|телевеж|офіс|будівл)"), W("пошкодж"), W("зруйнов"), W("обладнан"), W("домедичн"), W("першої\\s+допомоги"), W("тактичн[а-яії]*\\s+медицин"), W("бронежилет")] },
    { id: "transparency", name: "Прозорість власності медіа й телеграм-каналів", strong: [W("не\\s+розкрива[а-яії]*\\s+власник"), W("прозор[а-яії]*\\s+(медіа|видан|власн|телеграм)")], res: [W("прозор"), W("власник"), W("анонімн"), W("анонимн"), W("розкрива[а-яії]*\\s+власн"), W("відкрит[а-яії]*\\s+(медіа|видан)")] },
    { id: "jeansa", name: "Джинса й прихована реклама", strong: [W("джинс")], res: [W("джинс"), W("замовн[а-яії]*\\s+(матеріал|публікац)"), W("заказн"), W("прихован[а-яії]*\\s+реклам"), W("маркуван[а-яії]*\\s+реклам"), W("політичн[а-яії]*\\s+реклам"), W("під\\s+виглядом")] },
    { id: "regional", name: "Регіональні моніторинги ІМІ", res: [W("як\\s+([^\\s]+\\s+){0,3}медіа\\s+(висвітлю|пишуть|розповідають|говорять|подають|готуються|долають)"), W("моніторинг[а-яії]*\\s+(регіональн|місцев|обласн)"), W("представни[а-яії]*\\s+(імі|інституту\\s+масової\\s+інформації)\\s+(в|у)\\s"), W("регіональн[а-яії]*\\s+представни"), W("медіа\\s+(хмельниччини|полтавщини|волині|миколаївщини|одещини|харківщини|київщини|черкащини|чернігівщини|сумщини|житомирщини|рівненщини|тернопільщини|буковини|закарпаття|запоріжжя|дніпропетровщини)")] },
    { id: "propaganda", name: "Пропаганда, фейки й медіа окупованих територій", res: [W("пропаганд"), W("фейк"), W("дезінформ"), W("дезинформ"), W("маніпул"), W("манипул"), W("окупован"), W("оккупир"), W("(?<![а-яіїєґa-z])тот(?![а-яіїєґa-z])"), W("псевдовибор"), W("кремл"), W("російськ[а-яії]*\\s+(медіа|сми|канал|телеграм|пропаг)"), W("propaganda"), W("disinformation")] },
    { id: "mediabaza", name: "Медіабаза: хаби, школи й події", strong: [W("медіабаз|медиабаз|mediabaza|журфак")], res: [W("медіабаз"), W("медиабаз"), W("mediabaza"), W("журфак")] },
    { id: "learning", name: "Навчання й можливості для медійників", res: [W("тренінг"), W("тренинг"), W("медіашкол"), W("(?<![а-яіїєґa-z])школ"), W("навчан"), W("обучен"), W("грант"), W("конкурс"), W("стажуван"), W("вакансі"), W("шука[а-яії]*\\s+автор"), W("набір"), W("заявк"), W("вебінар"), W("воркшоп"), W("курс")] },
    { id: "market", name: "Медіаринок: закриття, фінанси, кадри", res: [W("закрит"), W("закрив"), W("припин[а-яії]*\\s+(друк|випуск|робот|мовлен)"), W("призупин"), W("фінансов[а-яії]*\\s+(криз|труднощ|стійк)"), W("кадров"), W("вигоран"), W("медіаринк"), W("абонплат"), W("дохід"), W("монетиз"), W("завершу[а-яії]*\\s+роботу")] },
    { id: "ai", name: "ШІ й технології в медіа", res: [W("(?<![а-яіїєґa-z])ші(?![а-яіїєґa-z])"), W("штучн[а-яії]*\\s+інтелект"), W("искусственн[а-я]*\\s+интеллект"), W("нейромереж"), W("chatgpt"), W("nano\\s+banana"), W("генератор[а-яії]*\\s+зображ"), W("(?<![a-z])ai(?![a-z])")] },
    { id: "events", name: "Події, форуми й дискусії за участю ІМІ", res: [W("форум"), W("дискусі"), W("конференці"), W("преміі|премія|премії"), W("відзнак"), W("нагород"), W("подкаст"), W("панел"), W("кругл[а-яії]*\\s+стол"), W("засідан"), W("делегаці"), W("партнерств")] }
  ];
  const THEME_DONOR = { id: "donor", name: "Проєктні матеріали партнерів (донорська плашка)" };
  const THEME_OWNED = { id: "owned", name: "Власні публікації ІМІ (інше)" };
  const THEME_OTHER = { id: "other", name: "Інші згадки" };
  const THEME_INDEX = {};
  THEMES.concat([THEME_DONOR, THEME_OWNED, THEME_OTHER]).forEach((t, i) => { THEME_INDEX[t.id] = { name: t.name, order: i }; });

  /* windows — фрагменти навколо кожної згадки окремо (щільність згадок має вагу),
     head — заголовок і анотація. Перемагає найбільший бал; нічия — порядок у таксономії. */
  function scoreThemes(windows, head) {
    const ws = windows.map(low), h = low(head);
    let best = null, bestScore = 0;
    for (const t of THEMES) {
      let s = 0;
      for (const w of ws) {
        for (const re of t.res) if (re.test(w)) s += 2;
        for (const re of t.strong || []) if (re.test(w)) s += 4;
      }
      for (const re of t.res) if (re.test(h)) s += 1;
      for (const re of t.strongHead || []) if (re.test(h)) s += 4;
      if (s > bestScore) { best = t; bestScore = s; }
    }
    return best;
  }

  /* ───────────────────────── типи згадок ───────────────────────── */
  const KIND = {
    owned: "Власна публікація ІМІ",
    donor: "Проєктна / донорська плашка",
    conflict: "ІМІ як сторона конфлікту чи критики",
    expert: "Експертний коментар ІМІ",
    position: "ІМІ як сторона позиції",
    data: "ІМІ як джерело даних і моніторингу",
    primary: "ІМІ як першоджерело новини",
    background: "Побіжна згадка (бекграунд)"
  };
  const KIND_ORDER = ["data", "primary", "expert", "position", "conflict", "background", "owned", "donor"];

  const RE_CONFLICT = /(заклика[а-яії]*|попроси[а-яії]*|проси[а-яії]*|вимага[а-яії]*)\s+(імі|інститут)[^.!?]{0,80}(не\s+включ|переглянут|прибрат|виключ|відмов|повернутися)|(звинувач|звинуват|обвиня|обвинув)[а-яії]*\s+(імі|інститут)|критикува[а-яії]*\s+(імі|інститут)|наклеп|грантоїд|грантоед|упереджен[а-яії]*\s+(імі|інститут|оцін|рейтинг)|повернутися\s+до\s+реальності|не\s+включати\s+(його|її|їх|нас)?\s*до\s+(рейтинг|моніторинг|перелік)|претензі[а-яії]*\s+до\s+(імі|інститут)|нiбито/;
  // негатив щодо ІМІ — лише оцінна, дискредитаційна подача, а не нейтральний переказ суперечки
  const RE_NEG_HEAD = /наклеп|грантоїд|грантоед|(звинувач|звинуват|дискредит)[а-яії]*\s+(імі|інститут)|повернутися\s+до\s+реальності|упереджен|каста\s+обраних|нiбито|брехн|маніпулю[а-яії]*\s+(імі|інститут)/;
  const RE_POSITION = /підписа|подписа|коаліц|коалиц|спільн[а-яії]*\s+заяв|звернен[а-яії]*\s+(до|медійн|організац)|засуджу|медійник[а-яії]*\s+вимага|організаці[а-яії]*\s+(закликал|вимага)|петиці|закликаємо|вимагаємо/;
  const RE_DATA = /моніторинг|мониторинг|дослідж|исследов|аналіз|анализ|рейтинг|перелік|переліку|список|списку|реєстр|за\s+даними|даних|дані\s|зафіксува|зафиксир|фіксує|статистик|підрахун|за\s+версією|за\s+оцінкою|по\s+версии|за\s+результатами|study|report|data/;
  const RE_ANNOUNCE = /відкри[а-яії]*\s+набір|оголоси[а-яії]*\s+(набір|конкурс)|запрошу[єю]|анонс|реєстрац[а-яії]*\s+(триває|відкрит)|приймають\s+заявки|приймає\s+заявки|подати\s+заявку|шука[єю]\s+автор/;
  const RE_PRIMARY = /повідоми|повідомля|повідомлен|за\s+інформацією|сообщ|заяви|за\s+словами|інформу|оголош|анонс|відкрил[а-яії]*\s+набір|запрошу|запуска|проводить|шука[єю]|розповіл|наголоси|зазначи|нагада/;
  const ROLE_RX = "(?:медіа)?(?:аналітик|експерт|юрист|дослідни|директор|представни|координатор|менеджер|редактор|голова|головою|головн[а-яіїєґ]*|фахів|спеціаліст|керівни|тренер|аналитик|эксперт|юрист|исследовател|представител|руководител)[а-яіїєґ]*";
  const ORG_RX = "(?:ІМІ|IMI|ИМИ|Інститут[а-яіїєґ]*\\s+масов[а-яіїєґ]*\\s+інформац[а-яіїєґ]*|Институт[а-яё]*\\s+массов[а-яё]*\\s+информац[а-яё]*|Медіабаз[а-яіїєґ]*(?:\\s+[А-ЯІЇЄҐ][а-яіїєґ'’ʼ]+)?)";
  const NAME_RX = "([А-ЯІЇЄҐ][а-яіїєґ'’ʼ]+\\s+[А-ЯІЇЄҐ][а-яіїєґ'’ʼ\\-]+)";
  const RE_EXPERT_1 = new RegExp(ROLE_RX + "(?:\\s+[^\\s.,;:!?]+){0,3}?\\s+" + ORG_RX + "(?:\\s+(?:в|у)\\s+[^\\s]+\\s+област[іиі])?,?\\s+" + NAME_RX);
  const RE_EXPERT_2 = new RegExp(NAME_RX + ",\\s+(?:[^\\s.,;:!?]+\\s+){0,2}" + ROLE_RX + "(?:\\s+[^\\s.,;:!?]+){0,2}?\\s+" + ORG_RX);
  const NOT_NAME = /^(?:(?:Про|Це|Цей|Ця|За|Як|Але|Та|І|На|У|В|Для|Він|Вона|Його|Її|Їхня|Там|Тут|Коли|Після|Під|Над)\s|Інститут|Институт|Україн|Медіабаз|Детектор|Суспільн)/;

  function nominative(name) {
    const parts = name.split(/\s+/);
    let f = parts[0];
    f = f.replace(/ы$/, "а").replace(/(ин|ан|ен|ал)і$/, "$1а").replace(/ою$/, "а").replace(/єю$/, "я").replace(/ією$/, "ія").replace(/ії$/, "ія").replace(/ой$/, "а").replace(/ей$/, "я");
    let l = parts.slice(1).join(" ");
    l = l.replace(/ською$/, "ська").replace(/цькою$/, "цька").replace(/ською$/, "ська").replace(/ої$/, "а").replace(/ою$/, "а").replace(/ій$/, "а");
    return f + (l ? " " + l : "");
  }
  function roleNom(r) {
    return r.replace(/инею$/, "иня").replace(/ицею$/, "иця").replace(/иці$/, "иця").replace(/кою$/, "ка").replace(/ці$/, "ка")
      .replace(/(ик|ер|ор|ст|ач|ент)(ом|ові|у|а)$/, "$1").replace(/ою$/, "а");
  }
  function findExpert(text) {
    if (!text) return null;
    for (const re of [RE_EXPERT_1, RE_EXPERT_2]) {
      const m = text.match(re);
      if (m && m[1] && !NOT_NAME.test(m[1])) {
        const roleM = m[0].match(new RegExp(ROLE_RX, "i"));
        return { name: nominative(m[1].trim()), raw: m[1].trim(), role: roleM ? roleNom(roleM[0].toLowerCase()) : "" };
      }
    }
    return null;
  }

  /* ───────────────────────── ознаки рядка ───────────────────────── */
  function isSocial(type) { const t = low(type); return t.includes("соціал") || t.includes("социал"); }
  function isTranscript(title) { return /^розшифровано\s+автоматично/i.test(norm(title)); }
  function isOwnAccount(place, link) {
    const p = low(place), l = low(link);
    if (/imi\.org\.ua|imiukraine|\/imi_ukraine|mediabaza/.test(l)) return true;
    if (!p) return false;
    if (/^імі$|^imi$|imi\s*ukraine/.test(p)) return true;
    if (/інститут\s+масов|институт\s+массов|institute\s+of\s+mass/.test(p)) return true;
    if (/^медіабаза|^mediabaza|^медиабаза/.test(p)) return true;
    return false;
  }
  function normUrl(u) {
    let s = norm(u);
    if (!s || !/^https?:\/\//i.test(s)) return "";
    s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/^m\./i, "");
    s = s.replace(/#.*$/, "");
    s = s.replace(/([?&])(utm_[^=&]+|fbclid|gclid|igsh|igshid|si)=[^&]*/gi, "$1").replace(/[?&]+$/, "").replace(/\?&/, "?");
    s = s.replace(/^(x|twitter)\.com\//i, "twitter.com/");
    s = s.replace(/^t\.me\/s\//i, "t.me/");
    s = s.replace(/\/+$/, "");
    return s.toLowerCase();
  }

  const STOP = new Set(("та і й в у на з із зі до про від для що як це цей ця які який яка але або за по при під над між через після перед " +
    "и в во на с со к по о об от для что как это этот эта которые который но или за при под над между через после перед не the of and in to a for on with by is").split(" "));
  function tokens(s, stem) {
    const out = new Set();
    low(s).replace(/[^a-zа-яіїєґ0-9' ]+/g, " ").split(" ").forEach(w => {
      w = w.replace(/'/g, "");
      if (w.length < 3 || STOP.has(w)) return;
      out.add(stem ? w.slice(0, stem) : w);
    });
    return out;
  }
  function jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    return inter / (a.size + b.size - inter);
  }
  function digitsSig(s) {
    const out = new Set();
    (norm(s).match(/\d{2,}/g) || []).forEach(d => out.add(d));
    return out;
  }
  function langCode(s) {
    const m = low(s).match(/\(([a-z]{2})\)/);
    return m ? m[1] : low(s);
  }

  function clip(s, n) {
    s = norm(s);
    if (s.length <= n) return s;
    const cut = s.slice(0, n);
    const sp = cut.lastIndexOf(" ");
    return (sp > n * 0.6 ? cut.slice(0, sp) : cut) + "…";
  }

  /* ───────────────────────── union-find ───────────────────────── */
  function UF(n) {
    const p = Array.from({ length: n }, (_, i) => i);
    const find = (x) => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; };
    const union = (a, b) => { a = find(a); b = find(b); if (a === b) return; if (a < b) p[b] = a; else p[a] = b; };
    return { find, union };
  }

  /* ════════════════════════════ АНАЛІЗ ════════════════════════════ */
  function analyze(rawRows, meta) {
    meta = meta || {};
    const COLS_REQUIRED = ["Заголовок", "Тип ЗМІ", "Джерело", "Дата виходу", "URL"];
    if (!rawRows || !rawRows.length) throw new Error("Файл порожній.");
    const missing = COLS_REQUIRED.filter(c => !(c in rawRows[0]));
    if (missing.length) throw new Error("Немає колонок: " + missing.join(", ") + ". Потрібна вигрузка Looqme, аркуш «Статті», перший рядок — заголовки.");

    /* 1. Рядки */
    const rows = rawRows.map((r, i) => {
      const type = norm(r["Тип ЗМІ"]);
      const title = norm(r["Заголовок"]);
      const lead = norm(r["Анотація"]);
      const text = norm(r["Текст"]) + (r["Текст на екрані"] ? " " + norm(r["Текст на екрані"]) : "");
      const vZmi = num(r["Потенційні перегляди (ЗМІ)"]);
      const vSoc = num(r["Потенційні перегляди (Соцмережі)"]);
      const social = isSocial(type);
      const place = norm(r["Назва місця публікації"]);
      const placeLink = norm(r["Посилання на місце публікації"]);
      const author = norm(r["Автор"]);
      return {
        i, title, lead, text, type, social,
        source: norm(r["Джерело"]), place, placeLink, author,
        url: norm(r["URL"]),
        contentType: norm(r["Тип контенту"]),
        rubric: norm(r["Рубрика"]),
        date: toISODate(r["Дата виходу"]),
        time: toTime(r["Час виходу"]),
        toneRaw: norm(r["Тональність"]) || "Не визначено",
        level: norm(r["Рівень видання"]),
        country: norm(r["Країна"]),
        lang: norm(r["Мова"]),
        role: norm(r["Роль"]),
        speakers: norm(r["Спікери"]),
        dups: num(r["Дублі"]),
        vZmi, vSoc,
        views: social ? vSoc : vZmi,
        transcript: isTranscript(title),
        ownAccount: social && (isOwnAccount(place, placeLink) || isOwnAccount(author, "")),
        ownSite: /imi\.org\.ua/i.test(r["Джерело"] || "") || /imi\.org\.ua/i.test(r["URL"] || "")
      };
    });
    const sumZmi = rows.reduce((s, r) => s + r.vZmi, 0);
    const sumSoc = rows.reduce((s, r) => s + r.vSoc, 0);
    const allDates = rows.map(r => r.date).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();

    /* 2. Згадки й шум (закритий перелік) */
    const noise = [];
    const kept = [];
    for (const r of rows) {
      const blob = r.title + "\n" + r.lead + "\n" + r.text;
      r.blob = blob;
      r.mentions = findMentions(blob);
      let reason = null, group = null;
      const ownComment = /коментар|комментар|відповідь|ответ/i.test(r.contentType) && r.social && isOwnAccount(r.place, r.placeLink);
      if (ownComment) { group = "own_comments"; reason = "Коментар під власним дописом ІМІ — залученість каналу, а не медіазгадка"; }
      else if (!r.mentions.length && r.ownAccount) { /* власний допис ІМІ без назви в тексті — це owned-публікація, не шум */ }
      else if (!r.mentions.length) {
        if (hasLowercaseOnlyAbbr(blob)) { group = "false_hits"; reason = "Хибне спрацювання: «імі» тут — інше слово (займенник, розпізнавання мовлення), не абревіатура ІМІ"; }
        else if (low(r.rubric) === "консолідатори") { group = "no_mention"; reason = "Консолідатор без згадки ІМІ в заголовку, анотації й тексті"; }
        else { group = "no_mention"; reason = "Немає згадки ІМІ чи Медіабази в заголовку, анотації й тексті"; }
      }
      if (group) { r.noiseGroup = group; r.noiseReason = reason; noise.push(r); }
      else kept.push(r);
    }

    /* 3. Плашки, контекст згадки */
    for (const r of kept) {
      const plate = [], editorial = [];
      for (const m of r.mentions) (isPlateMention(r.blob, m.i) ? plate : editorial).push(m);
      r.hasPlate = plate.length > 0;
      r.ownedFlag = r.ownSite || r.ownAccount;
      r.donor = !r.ownedFlag && editorial.length === 0 && plate.length > 0;
      const use = editorial.length ? editorial : r.mentions.length ? r.mentions : [{ i: 0, len: 0 }];
      // контекст: вікна ±220 знаків навколо редакційних згадок, злиті
      const spans = [];
      for (const m of use) {
        const a = Math.max(0, m.i - 220), b = Math.min(r.blob.length, m.i + m.len + 220);
        if (spans.length && a <= spans[spans.length - 1][1]) spans[spans.length - 1][1] = Math.max(spans[spans.length - 1][1], b);
        else spans.push([a, b]);
      }
      r.ctx = spans.map(([a, b]) => r.blob.slice(a, b)).join(" … ");
      r.near = use.map(m => r.blob.slice(Math.max(0, m.i - 120), Math.min(r.blob.length, m.i + m.len + 120))).join(" … ");
      r.windows = use.map(m => r.blob.slice(Math.max(0, m.i - 200), Math.min(r.blob.length, m.i + m.len + 200)));
      // короткий цитатний фрагмент (для автотранскриптів і реєстру)
      const first = use[0];
      if (first) {
        const a = Math.max(0, first.i - 110), b = Math.min(r.blob.length, first.i + first.len + 110);
        r.snippet = (a > 0 ? "…" : "") + r.blob.slice(a, b).replace(/\s+/g, " ").trim() + (b < r.blob.length ? "…" : "");
      } else r.snippet = "";
      r.ctxTokens = tokens(r.ctx, 6);
    }

    /* 4. Згортання дублів */
    const uf = UF(kept.length);
    const foldNote = new Map(); // index in kept -> note
    const byUrl = new Map();
    kept.forEach((r, k) => {
      const u = normUrl(r.url);
      if (!u) return;
      if (byUrl.has(u)) { uf.union(byUrl.get(u), k); foldNote.set(k, "той самий URL (рядок потрапив у масив кілька разів)"); }
      else byUrl.set(u, k);
    });
    const byChannelTitle = new Map();
    kept.forEach((r, k) => {
      if (r.transcript) return;
      const t = low(r.title).replace(/[^a-zа-яіїєґ0-9]+/g, " ").trim();
      if (t.length < 25) return;
      const key = low(r.source) + "|" + low(r.place) + "|" + t.slice(0, 160);
      if (byChannelTitle.has(key)) { uf.union(byChannelTitle.get(key), k); if (!foldNote.has(k)) foldNote.set(k, "той самий текст тим самим каналом (повторна публікація)"); }
      else byChannelTitle.set(key, k);
    });
    // автотранскрипти: той самий фрагмент в ефірі того самого медіа — ролик, джингл або повтор сюжету
    const trs = kept.map((r, k) => ({ r, k })).filter(x => x.r.transcript);
    for (let a = 0; a < trs.length; a++) for (let b = a + 1; b < trs.length; b++) {
      const A = trs[a].r, B = trs[b].r;
      if (low(A.source) !== low(B.source)) continue;
      const ta = tokens(A.snippet, 6), tb = tokens(B.snippet, 6);
      if (jaccard(ta, tb) >= 0.4) { uf.union(trs[a].k, trs[b].k); const why = "той самий фрагмент в ефірі (ролик, джингл чи повтор сюжету)"; foldNote.set(trs[b].k, why); if (!foldNote.has(trs[a].k)) foldNote.set(trs[a].k, why); }
    }
    // мовні версії одного тексту на тому самому ресурсі
    const web = kept.map((r, k) => ({ r, k, d: digitsSig(r.text), len: r.text.length, lang: langCode(r.lang) })).filter(x => !x.r.social && !x.r.transcript);
    for (let a = 0; a < web.length; a++) for (let b = a + 1; b < web.length; b++) {
      const A = web[a], B = web[b];
      if (low(A.r.source) !== low(B.r.source) || !A.lang || !B.lang || A.lang === B.lang) continue;
      const dd = Math.abs(Date.parse(A.r.date) - Date.parse(B.r.date)) / 86400000;
      if (!(dd <= 1)) continue;
      const ratio = Math.min(A.len, B.len) / Math.max(A.len, B.len || 1);
      if (ratio < 0.7) continue;
      if (A.d.size < 3 || B.d.size < 3) continue;
      if (jaccard(A.d, B.d) >= 0.6) { const why = "мовна версія того самого тексту (ймовірний дубль)"; uf.union(A.k, B.k); foldNote.set(B.k, why); if (!foldNote.has(A.k)) foldNote.set(A.k, why); }
    }

    const groups = new Map();
    kept.forEach((r, k) => { const g = uf.find(k); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(k); });
    const doubtful = [];
    const materials = [];
    let folded = 0;
    for (const ks of groups.values()) {
      const members = ks.map(k => kept[k]).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.i - b.i);
      const p = members[0];
      folded += members.length - 1;
      const maxViews = Math.max.apply(null, members.map(m => m.views));
      const notes = [];
      const mirrors = members.slice(1).map((m) => {
        return { url: m.url || "", src: m.source, date: m.date, time: m.time, views: m.views, why: foldNote.get(kept.indexOf(m)) || foldNote.get(kept.indexOf(p)) || "дубль" };
      });
      mirrors.forEach(x => { if (/мовна версія|ролик/.test(x.why)) notes.push(x.why); });
      const owned = members.some(m => m.ownedFlag);
      const donor = !owned && members.every(m => m.donor);
      materials.push({
        rows: members.map(m => m.i),
        p, owned, donor, views: maxViews, mirrors,
        hasPlate: members.some(m => m.hasPlate),
        notes: Array.from(new Set(notes))
      });
    }

    /* 5. Класифікація матеріалів */
    const out = materials.map(g => {
      const r = g.p;
      const head = r.title + " \n " + r.lead;
      const ownedFocus = r.title + " \n " + r.lead + " \n " + r.text.slice(0, 700);
      let theme;
      if (g.donor) theme = THEME_DONOR;
      else {
        const t = g.owned ? scoreThemes([ownedFocus], head) : scoreThemes(r.windows, r.transcript ? "" : head);
        theme = t || (g.owned ? THEME_OWNED : THEME_OTHER);
      }
      const f = low(r.ctx + " " + (r.transcript ? "" : head));
      const fHead = low(r.transcript ? r.near : head);
      const fNear = low(r.near + " " + (r.transcript ? "" : head));
      let kind;
      let expert = null;
      if (g.owned) kind = "owned";
      else if (g.donor) kind = "donor";
      else if (RE_CONFLICT.test(fNear)) kind = "conflict";
      else if ((expert = findExpert(r.ctx))) kind = "expert";
      else if (RE_POSITION.test(f)) kind = "position";
      else if (RE_ANNOUNCE.test(f)) kind = "primary";
      else if (RE_DATA.test(f)) kind = "data";
      else if (RE_PRIMARY.test(f)) kind = "primary";
      else kind = "background";
      if (!expert && !g.owned && !g.donor) expert = findExpert(r.ctx);

      // тональність: перевірка мітки Looqme
      const raw = r.toneRaw;
      let tone = raw, toneWhy = "";
      const critiqueInHead = RE_NEG_HEAD.test(fHead);
      if (kind === "conflict" && critiqueInHead && raw !== "Негатив") { tone = "Негатив"; toneWhy = "Конфліктна або критична подача щодо ІМІ — це негатив щодо організації, хоч мітка Looqme інша."; }
      else if (raw === "Негатив" && kind !== "conflict") { tone = "Нейтрал"; toneWhy = "Негативна тема (атака, загибель, злочин, фейк), але ІМІ подано як джерело, а не об'єкт критики."; }

      let displayTitle = r.title || "Без заголовка";
      if (r.transcript) {
        displayTitle = "(автотранскрипт) " + r.source + ", " + r.date + " " + r.time + ": «" + clip(r.snippet.replace(/^…|…$/g, ""), 150) + "»";
      } else if (r.social && (!r.title || r.title.length < 3)) {
        displayTitle = "(допис без тексту) " + (r.place || r.source);
      }
      const notes = g.notes.slice();
      if (r.transcript) notes.push("автотранскрипт ефіру");
      if (r.views === 0 && g.views === 0) notes.push("перегляди не підтверджені у наданому файлі");
      if (/коментар|комментар|відповідь/i.test(r.contentType)) {
        notes.push("коментар на сторонній сторінці");
        doubtful.push({ key: r.i, why: "Коментар користувача на сторонній сторінці зі згадкою ІМІ. Зараховано як згадку, але це не публікація медіа — перевірте вручну." });
      }
      g.mirrors.forEach(x => { if (/мовна версія/.test(x.why)) doubtful.push({ key: r.i, why: "Ймовірний дубль: мовна версія на тому самому ресурсі (" + (x.url || x.src) + "). Згорнуто в один матеріал за збігом дати, обсягу й чисел у тексті." }); });
      g.mirrors.forEach(x => { if (/ролик/.test(x.why)) doubtful.push({ key: r.i, why: "Автотранскрипт-повтор: той самий фрагмент в ефірі " + r.source + " (" + x.date + " " + x.time + "). Зараховано один раз." }); });

      return {
        id: "m" + r.i,
        key: r.i,
        date: r.date, time: r.time,
        src: r.source, place: r.place, mtype: r.type, social: r.social,
        title: r.title, displayTitle, url: r.url,
        views: g.views, viewsMissing: g.views === 0,
        owned: g.owned, donor: g.donor, hasPlate: g.hasPlate,
        kind, theme: theme.id, tone, toneRaw: raw, toneWhy,
        level: r.level, country: r.country, lang: r.lang, role: r.role,
        transcript: r.transcript, contentType: r.contentType,
        snippet: clip(r.snippet, 320),
        expert,
        mirrors: g.mirrors.map(x => ({ url: x.url, src: x.src, date: x.date, why: x.why })),
        rowsCount: g.rows.length,
        notes,
        _tok: tokens(r.transcript ? r.snippet : r.title, 6),
        _ctxTok: r.ctxTokens
      };
    });

    /* 6. Сюжети: матеріали, що переказують той самий текст ІМІ (у межах теми) */
    const order = out.slice().sort((a, b) => b.views - a.views || a.date.localeCompare(b.date) || a.key - b.key);
    const suf = UF(order.length);
    for (let a = 0; a < order.length; a++) for (let b = a + 1; b < order.length; b++) {
      const A = order[a], B = order[b];
      if (A.theme !== B.theme || A.theme === "donor") continue;
      if (jaccard(A._tok, B._tok) >= 0.4 || jaccard(A._ctxTok, B._ctxTok) >= 0.45) suf.union(a, b);
    }
    const storyGroups = new Map();
    order.forEach((m, k) => { const g = suf.find(k); if (!storyGroups.has(g)) storyGroups.set(g, []); storyGroups.get(g).push(m); });
    const stories = [];
    let sn = 0;
    for (const list of storyGroups.values()) {
      const source = list.find(m => m.owned && /imi\.org\.ua/i.test(m.src + m.url)) || list.find(m => m.owned);
      const lead = source || list[0];
      const id = "s" + (++sn);
      list.forEach(m => { m.story = id; });
      if (list.length > 1) {
        const firstDate = list.map(m => m.date + " " + m.time).sort()[0];
        list.forEach(m => { if (m !== lead && !m.owned && (m.date + " " + m.time) > firstDate && m.src !== lead.src) m.notes.push("передрук / переказ того самого тексту"); });
      }
      stories.push({ id, theme: lead.theme, title: lead.transcript ? lead.displayTitle : lead.title, url: lead.url, imiSource: !!source, n: list.length });
    }
    out.forEach(m => { delete m._tok; delete m._ctxTok; });

    /* 7. Контрольні підсумки */
    const sum = (arr) => arr.reduce((s, m) => s + m.views, 0);
    const owned = out.filter(m => m.owned);
    const earned = out.filter(m => !m.owned);
    const donor = earned.filter(m => m.donor);
    const editorial = earned.filter(m => !m.donor);
    const noiseByGroup = {};
    noise.forEach(n => { noiseByGroup[n.noiseGroup] = (noiseByGroup[n.noiseGroup] || 0) + 1; });

    out.sort((a, b) => b.views - a.views || a.date.localeCompare(b.date) || a.key - b.key);

    const period = { from: allDates[0] || "", to: allDates[allDates.length - 1] || "" };
    return {
      v: ENGINE_VERSION,
      id: (period.from || "period") + "_" + (period.to || "period"),
      createdAt: meta.createdAt || null,
      fileName: meta.fileName || "",
      fileHash: meta.fileHash || "",
      period,
      control: {
        rows: rows.length,
        noiseRows: noise.length,
        noiseByGroup,
        cleanRows: kept.length,
        folded,
        materials: out.length,
        earned: earned.length,
        owned: owned.length,
        donor: donor.length,
        editorial: editorial.length,
        viewsAll: sum(out),
        viewsEarned: sum(earned),
        viewsOwned: sum(owned),
        viewsDonor: sum(donor),
        viewsEditorial: sum(editorial),
        viewsNoise: noise.reduce((s, r) => s + r.views, 0),
        sumZmi, sumSoc
      },
      themes: Object.keys(THEME_INDEX).map(id => ({ id, name: THEME_INDEX[id].name })),
      kinds: KIND,
      stories,
      materials: out,
      noise: noise.map(n => ({
        key: n.i, date: n.date, src: n.source, place: n.place, title: clip(n.title || "(без заголовка)", 160), url: n.url,
        views: n.views, group: n.noiseGroup, why: n.noiseReason
      })),
      doubtful
    };
  }

  const NOISE_GROUPS = {
    no_mention: "Без згадки ІМІ",
    false_hits: "Хибні спрацювання",
    own_comments: "Коментарі під власними дописами"
  };

  return { analyze, findExpert, ENGINE_VERSION, THEMES, KIND, KIND_ORDER, NOISE_GROUPS, THEME_INDEX, norm, clip };
});
