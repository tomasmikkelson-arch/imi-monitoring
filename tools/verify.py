# Запуск: python3 tools/verify.py файл.xlsx reports/<період>.json
# Незалежна перевірка звіту за правилами промпта (не використовує engine.js)
import sys, json, re, pandas as pd, math
xlsx, rep = sys.argv[1], sys.argv[2]
df = pd.read_excel(xlsx, sheet_name="Статті", dtype=object)
R = json.load(open(rep, encoding="utf-8"))
C = R["control"]; ok = True
def chk(name, cond, extra=""):
    global ok
    print(("OK   " if cond else "FAIL ") + name + (" " + str(extra) if extra else ""))
    ok &= bool(cond)
def num(v):
    try:
        f = float(str(v).replace(" ", "").replace(",", "."))
        return 0 if math.isnan(f) else f
    except: return 0
def s(v): return "" if v is None or (isinstance(v, float) and math.isnan(v)) else str(v)
# 1. контроль колонок
chk("сума «Потенційні перегляди (ЗМІ)»", C["sumZmi"] == sum(num(v) for v in df["Потенційні перегляди (ЗМІ)"]), C["sumZmi"])
chk("сума «Потенційні перегляди (Соцмережі)»", C["sumSoc"] == sum(num(v) for v in df["Потенційні перегляди (Соцмережі)"]), C["sumSoc"])
chk("рядків у файлі", C["rows"] == len(df), len(df))
dates = sorted(s(d)[:10] for d in df["Дата виходу"] if s(d))
chk("період = мін/макс «Дата виходу»", (R["period"]["from"], R["period"]["to"]) == (dates[0], dates[-1]), (dates[0], dates[-1]))
# 2. перегляди рядка: соцмережі -> (Соцмережі), інше -> (ЗМІ)
def views(i):
    r = df.iloc[i]
    return num(r["Потенційні перегляди (Соцмережі)"]) if "соціальн" in s(r["Тип ЗМІ"]).lower() else num(r["Потенційні перегляди (ЗМІ)"])
# 3. згадка ІМІ — незалежний регекс
full = re.compile(r"інститут\w{0,4}\s+масов|институт\w{0,4}\s+массов|institute\s+of\s+mass|медіабаз|медиабаз|mediabaza|imiukraine|imi\.org\.ua", re.I)
abbr = re.compile(r"(?<![A-Za-zА-Яа-яІіЇїЄєҐґЁё0-9])[IІИ][MМ][IІИ](?![A-Za-zА-Яа-яІіЇїЄєҐґЁё0-9])")
def mention(i):
    r = df.iloc[i]; t = " ".join(s(r[c]) for c in ["Заголовок", "Анотація", "Текст"] + (["Текст на екрані"] if "Текст на екрані" in df else []))
    return bool(full.search(t) or abbr.search(t))
own_place = re.compile(r"^імі$|^imi$|інститут\s+масов|^медіабаза", re.I)
own_link = re.compile(r"imi\.org\.ua|imiukraine|mediabaza", re.I)
def own_acc(i):
    r = df.iloc[i]; return "соціальн" in s(r["Тип ЗМІ"]).lower() and (own_place.search(s(r["Назва місця публікації"]).strip()) or own_link.search(s(r["Посилання на місце публікації"])))
noise_keys = {n["key"] for n in R["noise"]}
exp_noise = set()
for i in range(len(df)):
    ct = s(df.iloc[i]["Тип контенту"]).lower()
    if own_acc(i) and ("коментар" in ct or "відповідь" in ct): exp_noise.add(i)
    elif not mention(i) and not own_acc(i): exp_noise.add(i)
chk("шум = рядки без згадки + коментарі під власними дописами", noise_keys == exp_noise, sorted(noise_keys ^ exp_noise))
chk("рядків після очищення = рядки − шум", C["cleanRows"] == len(df) - len(noise_keys))
chk("перегляди шуму", C["viewsNoise"] == sum(views(i) for i in noise_keys), C["viewsNoise"])
M = R["materials"]
chk("матеріалів = рядки після очищення − згорнуто", C["materials"] == C["cleanRows"] - C["folded"] == len(M))
chk("кожен очищений рядок у рівно одному матеріалі", sum(m["rowsCount"] for m in M) == C["cleanRows"])
keys = [m["key"] for m in M]
chk("жоден шумовий рядок не потрапив у матеріали", not (set(keys) & noise_keys))
# 4. перегляди матеріалу
bad = [m["key"] for m in M if m["rowsCount"] == 1 and m["views"] != views(m["key"])]
chk("матеріали з одного рядка: перегляди з правильної колонки", not bad, bad[:5])
bad = [m["key"] for m in M if m["views"] < views(m["key"])]
chk("згорнуті матеріали: перегляди ≥ перегляди основного рядка", not bad, bad[:5])
# 5. суми
sv = lambda f: sum(m["views"] for m in M if f(m))
chk("перегляди всього = сума матеріалів", C["viewsAll"] == sv(lambda m: True), C["viewsAll"])
chk("earned + owned = всього", C["viewsEarned"] + C["viewsOwned"] == C["viewsAll"])
chk("плашки + редакційні = earned", C["viewsDonor"] + C["viewsEditorial"] == C["viewsEarned"])
chk("к-сть earned/owned/плашки/редакційні", (C["earned"], C["owned"], C["donor"], C["editorial"]) == (sum(not m["owned"] for m in M), sum(m["owned"] for m in M), sum(m["donor"] for m in M), sum(not m["owned"] and not m["donor"] for m in M)))
chk("owned не буває плашкою", not any(m["owned"] and m["donor"] for m in M))
# 6. посилання й заголовки
bad = [m["key"] for m in M if m["url"] != s(df.iloc[m["key"]]["URL"]).strip()]
chk("URL узято з файлу без змін", not bad, bad[:5])
norm = lambda t: re.sub(r"\s+", " ", s(t).replace("\xa0", " ").replace("&quot;", '"').replace("&amp;", "&")).strip()
bad = [m["key"] for m in M if not m["transcript"] and len(norm(df.iloc[m["key"]]["Заголовок"])) > 2 and m["displayTitle"] != norm(df.iloc[m["key"]]["Заголовок"])]
chk("заголовки дослівно з файлу (крім автотранскриптів)", not bad, bad[:5])
bad = [m["key"] for m in M if m["transcript"] and not m["displayTitle"].startswith("(автотранскрипт)")]
chk("автотранскрипти позначені, службовий заголовок не видано за назву", not bad)
# 7. owned
bad = [m["key"] for m in M if m["owned"] != bool(own_acc(m["key"]) or re.search(r"imi\.org\.ua", s(df.iloc[m["key"]]["Джерело"]) + s(df.iloc[m["key"]]["URL"]), re.I))]
chk("owned = imi.org.ua або акаунти ІМІ/Медіабаз", not bad, bad[:8])
# 8. заборонені колонки: жодна сума не дорівнює сумам аудиторії / AVE
for col in ["Аудиторія джерела (ЗМІ)", "Аудиторія місця публікації", "Сумарна кількість переглядів разом із дублями", "AVE"]:
    if col in df: chk("не використано «%s»" % col, C["viewsAll"] != sum(num(v) for v in df[col]))
# 9. дублі за URL згорнуто
from collections import Counter
cu = Counter(m["url"].lower().rstrip("/") for m in M if m["url"].startswith("http"))
dup = [u for u, n in cu.items() if n > 1]
chk("немає двох матеріалів з однаковим URL", not dup, dup[:3])
print("\nПІДСУМОК:", "усе збігається" if ok else "є розбіжності")
