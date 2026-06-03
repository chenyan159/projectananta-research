import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SITE_ROOT = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(SITE_ROOT, "..", "..");
const PUBLIC_DATA = path.join(SITE_ROOT, "public", "data");
const COMPANY_REPORT_DIR = path.join(PUBLIC_DATA, "reports", "company");
const INDUSTRY_REPORT_DIR = path.join(PUBLIC_DATA, "reports", "industry");

const FUND_ROOT = path.join(PROJECT_ROOT, "基本面");
const COMPANY_ROOT = path.join(FUND_ROOT, "公司调研");
const INDUSTRY_ROOT = path.join(FUND_ROOT, "行业调研");
const RANKING_ROOT = path.join(FUND_ROOT, "分析报告", "投资排序");
const FEATURE_ROOT = path.join(FUND_ROOT, "特征量化", "量化评分");
const FINANCE_ROOT = path.join(FUND_ROOT, "日度资料", "每日金融数据");

const companyToIndustryCategory = {
  "AI服务器_存储_EMS": "AI服务器_存储_芯片",
  "AI计算芯片_EDA_IP_custom_ASIC": "AI服务器_存储_芯片",
  "AI网络_光互联_连接器": "AI网络_光互联_铜互联",
  "半导体材料_化学品_基板": "晶圆制造_设备_材料_测试",
  "电力_发电_能源_储能": "AI园区电力_机电_冷却",
  "封测_检测_计量_光罩": "晶圆制造_设备_材料_测试",
  "机电_冷却_工程_水处理_边缘工业AI": "AI园区电力_机电_冷却",
  "晶圆制造_前道设备": "晶圆制造_设备_材料_测试",
  "配电_电源_功率器件": "AI园区电力_机电_冷却",
  "云算力_IDC_AI软件平台": "AI服务器_存储_芯片",
};

async function main() {
  await prepareOutput();
  const companyIndex = await parseCompanyIndex();
  const industryIndex = await parseIndustryIndex();
  const industryReports = await buildIndustryReports(industryIndex);
  const companies = await buildCompanies(companyIndex, industryReports);
  const rankings = await buildRankings();
  const features = await buildFeatures(companies);
  const industries = attachIndustryCompanyCounts(industryIndex, industryReports, companies, rankings);
  const duplicateCompanyReports = await findDuplicateCompanyReports(companyIndex);
  const latestFinancialDate = await latestDateFromFiles(FINANCE_ROOT, /^每日金融数据_(\d{4}-\d{2}-\d{2})\.md$/);
  const quality = buildQuality({
    companies,
    companyIndex,
    industries,
    industryIndex,
    rankings,
    features,
    industryReports,
    duplicateCompanyReports,
  });
  const meta = buildMeta({ companies, industries, rankings, features, quality, latestFinancialDate });

  await writeJson(path.join(PUBLIC_DATA, "meta.json"), meta);
  await writeJson(path.join(PUBLIC_DATA, "companies.json"), companies);
  await writeJson(path.join(PUBLIC_DATA, "industries.json"), industries);
  await writeJson(path.join(PUBLIC_DATA, "rankings.json"), rankings);
  await writeJson(path.join(PUBLIC_DATA, "features.json"), features);
  await writeJson(path.join(PUBLIC_DATA, "quality.json"), quality);

  console.log(`Wrote site data to ${PUBLIC_DATA}`);
  console.log(`Companies: ${companies.length}, industries: ${industries.length}, features: ${features.features.length}`);
}

async function prepareOutput() {
  await fs.mkdir(COMPANY_REPORT_DIR, { recursive: true });
  await fs.mkdir(INDUSTRY_REPORT_DIR, { recursive: true });
  await cleanJsonDir(COMPANY_REPORT_DIR);
  await cleanJsonDir(INDUSTRY_REPORT_DIR);
}

async function cleanJsonDir(dir) {
  const files = await safeReadDir(dir);
  await Promise.all(files.filter((name) => name.endsWith(".json")).map((name) => fs.rm(path.join(dir, name), { force: true })));
}

async function parseCompanyIndex() {
  const file = path.join(COMPANY_ROOT, "公司索引.md");
  const text = await readText(file);
  const rows = parseMarkdownTables(text)
    .flat()
    .filter((row) => row["股票代号"] && row["公司名称"]);
  return rows.map((row) => ({
    ticker: cleanCell(row["股票代号"]).toUpperCase(),
    name: cleanCell(row["公司名称"]),
    category: cleanCell(row["目录"]).replace(/[\\/]+$/, ""),
  }));
}

async function parseIndustryIndex() {
  const file = path.join(INDUSTRY_ROOT, "行业索引.md");
  const text = await readText(file);
  const rows = parseMarkdownTables(text)
    .flat()
    .filter((row) => row["行业名称"] && row["目录"]);
  return rows.map((row) => ({
    name: cleanCell(row["行业名称"]),
    category: cleanCell(row["目录"]).replace(/[\\/]+$/, ""),
    slug: stableSlug(cleanCell(row["行业名称"])),
  }));
}

async function buildCompanies(indexRows, industryReports) {
  const reportFiles = await directMarkdownFilesByCategory(COMPANY_ROOT, ["研究方法", "tmp", "评估备份"]);
  const reportsByTicker = new Map();
  for (const row of indexRows) {
    const categoryFiles = reportFiles.get(row.category) || [];
    const candidates = categoryFiles.filter((file) => tickerInFileName(row.ticker, path.basename(file)));
    if (candidates.length) {
      reportsByTicker.set(row.ticker, chooseLatestFile(candidates));
    }
  }

  const industryByCategory = new Map();
  for (const industry of industryReports.values()) {
    if (!industryByCategory.has(industry.category)) industryByCategory.set(industry.category, []);
    industryByCategory.get(industry.category).push(industry.slug);
  }

  const companies = [];
  for (const row of indexRows) {
    const reportPath = reportsByTicker.get(row.ticker);
    const relatedIndustryCategory = companyToIndustryCategory[row.category];
    const relatedIndustrySlugs = relatedIndustryCategory ? industryByCategory.get(relatedIndustryCategory) || [] : [];
    let report = null;
    if (reportPath) {
      const content = redactLocalPaths(await readText(reportPath));
      const meta = parseReportMeta(content, reportPath);
      const dataFile = `reports/company/${row.ticker}.json`;
      report = {
        title: meta.title,
        reportDate: meta.reportDate,
        sourcePath: relativePath(reportPath),
        dataFile,
      };
      await writeJson(path.join(PUBLIC_DATA, dataFile), {
        ticker: row.ticker,
        name: row.name,
        category: row.category,
        ...report,
        markdown: content,
      });
    }
    companies.push({
      ticker: row.ticker,
      name: row.name,
      category: row.category,
      relatedIndustrySlugs,
      hasReport: Boolean(report),
      report,
    });
  }
  return companies;
}

async function buildIndustryReports(indexRows) {
  const reportFiles = await directMarkdownFilesByCategory(INDUSTRY_ROOT, ["研究方法", "产业背景"]);
  const byStandardName = new Map();
  const bySlug = new Map();

  for (const [category, files] of reportFiles.entries()) {
    for (const file of files) {
      const content = redactLocalPaths(await readText(file));
      const meta = parseIndustryMeta(content, file, category);
      const canonical = normalizeName(meta.standardName);
      const slug = stableSlug(canonical);
      const dataFile = `reports/industry/${slug}.json`;
      const report = {
        name: meta.standardName,
        slug,
        category: meta.category || category,
        reportDate: meta.reportDate,
        title: meta.title,
        sourcePath: relativePath(file),
        dataFile,
      };
      byStandardName.set(canonical, report);
      bySlug.set(slug, report);
      await writeJson(path.join(PUBLIC_DATA, dataFile), {
        ...report,
        markdown: content,
      });
    }
  }

  for (const row of indexRows) {
    const canonical = normalizeName(row.name);
    const matched = byStandardName.get(canonical) || bySlug.get(stableSlug(row.name));
    if (matched) {
      matched.indexName = row.name;
      matched.indexCategory = row.category;
    }
  }

  return byStandardName;
}

function attachIndustryCompanyCounts(indexRows, reportMap, companies, rankings) {
  const balancedRows = rankings.runs.balanced?.rows || [];
  const rankingByTicker = new Map(balancedRows.map((row) => [row.ticker, row]));
  return indexRows.map((row) => {
    const report = reportMap.get(normalizeName(row.name)) || null;
    const relatedCompanies = companies.filter((company) => company.relatedIndustrySlugs.includes(row.slug));
    const rankedCompanies = relatedCompanies
      .map((company) => rankingByTicker.get(company.ticker))
      .filter(Boolean)
      .sort((a, b) => Number(a.rank) - Number(b.rank));
    return {
      ...row,
      companyCount: relatedCompanies.length,
      topCompanyTickers: rankedCompanies.slice(0, 8).map((r) => r.ticker),
      hasReport: Boolean(report),
      hasReportText: report ? "有" : "缺失",
      reportDate: report?.reportDate || "",
      report,
    };
  });
}

async function buildRankings() {
  const files = (await safeReadDir(RANKING_ROOT))
    .filter((name) => name.endsWith(".csv"))
    .map((name) => path.join(RANKING_ROOT, name));
  const specs = [
    { key: "crossCheck", label: "交叉检查", matcher: /^投资排序_公司调研交叉检查_(\d{4}-\d{2}-\d{2})\.csv$/ },
    { key: "veryAggressive", label: "非常激进", matcher: /^非常激进投资排序_(\d{4}-\d{2}-\d{2})\.csv$/ },
    { key: "aggressive", label: "激进", matcher: /^激进投资排序_(\d{4}-\d{2}-\d{2})\.csv$/ },
    { key: "balanced", label: "平衡", matcher: /^投资排序_(\d{4}-\d{2}-\d{2})\.csv$/ },
  ];

  const runs = {};
  for (const spec of specs) {
    const matches = files
      .map((file) => ({ file, match: path.basename(file).match(spec.matcher) }))
      .filter((item) => item.match)
      .sort((a, b) => b.match[1].localeCompare(a.match[1]));
    if (!matches.length) continue;
    const { file, match } = matches[0];
    const rawRows = parseCsv(await readText(file));
    runs[spec.key] = {
      key: spec.key,
      label: spec.label,
      date: match[1],
      sourcePath: relativePath(file),
      rowCount: rawRows.length,
      rows: rawRows.map((row) => normalizeRankingRow(row, spec.key)),
    };
  }
  return { runs };
}

function normalizeRankingRow(row, kind) {
  const normalized = {
    rank: value(row.rank) || value(row.final_rank),
    tier: value(row.tier),
    ticker: value(row.ticker).toUpperCase(),
    name: value(row.name) || value(row.company),
    category: value(row.category),
    expectedReturn:
      value(row.expected_return) ||
      value(row.aggressive_expected_return) ||
      value(row.weighted_9m_pct) ||
      value(row.ret_base_9m),
    score: value(row.score) || value(row.final_score),
    certainty: value(row.certainty) || value(row.credibility) || value(row.ai_demand_score),
    protection: value(row.protection) || value(row.original_protection),
    pe: value(row.pe) || value(row.ttm_pe),
    fpe: value(row.fpe) || value(row.forward_pe),
    ps: value(row.ps),
    iv: value(row.iv) || value(row.iv_raw) || value(row.iv_pct),
    marketCap: value(row.market_cap) || value(row.market_cap_b),
    price: value(row.price) || value(row.price_raw),
    dataCheck: value(row.data_check) || value(row.finance_remarks),
    reason: value(row.reason) || value(row.research_reason),
    sourceEvalFile: value(row.eval_file) || value(row.source_eval_file) || value(row.research_file),
    auditTag: value(row.audit_tag),
    auditNote: value(row.audit_note),
    researchFlags: value(row.research_flags),
    evidence: value(row.evidence),
  };
  if (kind === "crossCheck" && !normalized.certainty) normalized.certainty = normalized.auditTag;
  return normalized;
}

async function buildFeatures(companies) {
  const allFiles = (await safeReadDir(FEATURE_ROOT))
    .filter((name) => /^F\d+_.+_量化评分_\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .map((name) => path.join(FEATURE_ROOT, name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  const latestByFeature = new Map();
  for (const file of allFiles) {
    const name = path.basename(file);
    const match = name.match(/^(F\d+)_([\s\S]+)_量化评分_(\d{4}-\d{2}-\d{2})\.md$/);
    if (!match) continue;
    const [, id, , date] = match;
    const current = latestByFeature.get(id);
    if (!current || date > current.date) latestByFeature.set(id, { file, date });
  }
  const files = [...latestByFeature.values()]
    .map((item) => item.file)
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  const companyByTicker = new Map(companies.map((company) => [company.ticker, company]));
  const features = [];
  const allScores = [];
  const byFeature = {};
  const scoresByTicker = {};
  const scoreIndex = {};
  const parseProblems = [];

  for (const file of files) {
    const name = path.basename(file);
    const match = name.match(/^(F\d+)_([\s\S]+)_量化评分_(\d{4}-\d{2}-\d{2})\.md$/);
    if (!match) continue;
    const [, id, featureName, date] = match;
    const text = await readText(file);
    const rows = parseFeatureTable(text, { id, featureName, date, sourcePath: relativePath(file) });
    if (!rows.length) parseProblems.push(`${name}: no rows parsed`);
    features.push({ id, name: featureName, date, sourcePath: relativePath(file), rowCount: rows.length });
    byFeature[id] = rows.map((row) => {
      const company = companyByTicker.get(row.ticker);
      return {
        ...row,
        featureId: id,
        featureName,
        companyName: row.companyName || company?.name || "",
        category: row.category || company?.category || "",
      };
    });
    for (const row of byFeature[id]) {
      allScores.push(row);
      if (!scoresByTicker[row.ticker]) scoresByTicker[row.ticker] = [];
      if (!scoreIndex[row.ticker]) scoreIndex[row.ticker] = {};
      scoresByTicker[row.ticker].push(row);
      scoreIndex[row.ticker][id] = row;
    }
  }

  for (const rows of Object.values(scoresByTicker)) {
    rows.sort((a, b) => a.featureId.localeCompare(b.featureId));
  }

  return { features, scores: allScores, byFeature, scoresByTicker, scoreIndex, parseProblems };
}

function parseFeatureTable(markdown, feature) {
  const lines = markdown.split(/\r?\n/);
  let start = lines.findIndex((line) => line.includes("全公司排序表"));
  if (start < 0) start = lines.findIndex((line) => line.includes("排序表"));
  if (start < 0) return [];
  const tableLines = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      if (tableLines.length) break;
      continue;
    }
    if (line.startsWith("|")) tableLines.push(line);
    else if (tableLines.length) break;
  }
  if (tableLines.length < 3) return [];
  const header = splitMarkdownRow(tableLines[0]);
  const rows = [];
  const indices = {
    rank: findHeader(header, ["排名"]),
    ticker: findHeader(header, ["股票代号", "代码", "Ticker"]),
    companyName: findHeader(header, ["公司名称", "公司"]),
    category: findHeader(header, ["分类目录", "分类"]),
    score: findHeader(header, ["特征分", "分数", "评分"]),
    evidenceGrade: findHeader(header, ["证据等级", "证据"]),
    confidence: findHeader(header, ["置信度"]),
    evidence: findHeader(header, ["核心证据", "证据摘要"]),
  };
  for (const line of tableLines.slice(2)) {
    if (/^\|?\s*:?-{3,}/.test(line)) continue;
    const cells = splitMarkdownRow(line);
    const ticker = cleanCell(cells[indices.ticker] || "").toUpperCase();
    if (!ticker || ticker === "股票代号") continue;
    rows.push({
      featureId: feature.id,
      featureName: feature.featureName,
      rank: cleanCell(cells[indices.rank]),
      ticker,
      companyName: cleanCell(cells[indices.companyName]),
      category: cleanCell(cells[indices.category]),
      score: parseNumber(cleanCell(cells[indices.score])),
      evidenceGrade: cleanCell(cells[indices.evidenceGrade]),
      confidence: cleanCell(cells[indices.confidence]),
      evidence: cleanCell(cells[indices.evidence]),
    });
  }
  return rows;
}

function buildQuality({
  companies,
  companyIndex,
  industries,
  industryIndex,
  rankings,
  features,
  industryReports,
  duplicateCompanyReports,
}) {
  const alerts = [];
  const companyReportMissing = companies.filter((company) => !company.hasReport);
  if (companyReportMissing.length) {
    alerts.push({
      severity: "warn",
      type: "company-report-missing",
      title: "公司索引中存在未匹配正式报告",
      message: companyReportMissing.map((c) => c.ticker).join(", "),
    });
  }

  if (duplicateCompanyReports.length) {
    alerts.push({
      severity: "info",
      type: "company-report-duplicates",
      title: "部分公司存在多份正式报告",
      message: duplicateCompanyReports.map((item) => `${item.ticker}(${item.count})`).join(", "),
    });
  }

  for (const [key, run] of Object.entries(rankings.runs)) {
    const tickers = new Set(run.rows.map((row) => row.ticker));
    const missing = companyIndex.filter((company) => !tickers.has(company.ticker)).map((company) => company.ticker);
    if (missing.length) {
      alerts.push({
        severity: "warn",
        type: `ranking-missing-${key}`,
        title: `${run.label}排名未覆盖全部公司`,
        message: `缺失 ${missing.length} 家：${missing.join(", ")}`,
      });
    }
  }

  const missingIndustryReports = industries.filter((industry) => !industry.hasReport);
  if (missingIndustryReports.length) {
    alerts.push({
      severity: "info",
      type: "industry-report-missing",
      title: "行业索引中存在未匹配正式报告",
      message: missingIndustryReports.map((industry) => industry.name).join("；"),
    });
  }

  for (const feature of features.features) {
    if (feature.rowCount !== rankings.runs.balanced?.rowCount) {
      alerts.push({
        severity: "info",
        type: `feature-coverage-${feature.id}`,
        title: `${feature.id} 覆盖数与平衡排名不同`,
        message: `${feature.name}: ${feature.rowCount} 行，平衡排名 ${rankings.runs.balanced?.rowCount || 0} 行`,
      });
    }
  }

  if (features.parseProblems.length) {
    alerts.push({
      severity: "warn",
      type: "feature-parse",
      title: "部分特征评分表解析不完整",
      message: features.parseProblems.join("；"),
    });
  }

  return {
    summary: {
      companyIndexCount: companyIndex.length,
      companyReportUnique: companies.filter((company) => company.hasReport).length,
      industryIndexCount: industryIndex.length,
      industryReportUnique: industries.filter((industry) => industry.hasReport).length,
      featureFileCount: features.features.length,
      rankingRuns: Object.fromEntries(Object.entries(rankings.runs).map(([key, run]) => [key, run.rowCount])),
      rawIndustryReportCount: industryReports.size,
    },
    alerts,
  };
}

async function findDuplicateCompanyReports(companyIndex) {
  const reportFiles = await directMarkdownFilesByCategory(COMPANY_ROOT, ["研究方法", "tmp", "评估备份"]);
  const duplicates = [];
  for (const row of companyIndex) {
    const categoryFiles = reportFiles.get(row.category) || [];
    const matches = categoryFiles.filter((file) => tickerInFileName(row.ticker, path.basename(file)));
    if (matches.length > 1) {
      duplicates.push({
        ticker: row.ticker,
        count: matches.length,
        files: matches.map(relativePath),
      });
    }
  }
  return duplicates;
}

function buildMeta({ companies, industries, rankings, features, quality, latestFinancialDate }) {
  const rankingDates = Object.values(rankings.runs)
    .map((run) => run.date)
    .filter(Boolean)
    .sort();
  return {
    generatedAt: new Date().toISOString(),
    generatedAtDisplay: new Date().toLocaleString("zh-CN", { hour12: false }),
    sourceRootName: "Investment",
    siteRoot: "tools/site",
    companyCount: companies.length,
    companyReportCount: companies.filter((company) => company.hasReport).length,
    industryCount: industries.length,
    industryReportCount: industries.filter((industry) => industry.hasReport).length,
    featureCount: features.features.length,
    latestRankingDate: rankingDates.at(-1) || "",
    latestFinancialDate,
    qualityAlertCount: quality.alerts.length,
  };
}

async function directMarkdownFilesByCategory(root, excludedDirs) {
  const dirs = await fs.readdir(root, { withFileTypes: true });
  const map = new Map();
  for (const dirent of dirs) {
    if (!dirent.isDirectory() || excludedDirs.includes(dirent.name)) continue;
    const dir = path.join(root, dirent.name);
    const files = (await safeReadDir(dir))
      .filter((name) => name.endsWith(".md") && name !== "AGENTS.md")
      .map((name) => path.join(dir, name));
    map.set(dirent.name, files);
  }
  return map;
}

function parseReportMeta(content, file) {
  return {
    title: firstMatch(content, /^#\s+(.+)$/m) || path.basename(file, ".md"),
    reportDate: firstMatch(content, /报告日期[:：]\s*(\d{4}-\d{2}-\d{2})/) || firstDate(path.basename(file)),
  };
}

function parseIndustryMeta(content, file, fallbackCategory) {
  return {
    title: firstMatch(content, /^#\s+(.+)$/m) || path.basename(file, ".md"),
    standardName:
      firstMatch(content, /标准行业名称[:：]\s*(.+)/) ||
      path.basename(file, ".md").replace(/^行业调研_/, "").replace(/_\d{4}-\d{2}-\d{2}$/, ""),
    category: firstMatch(content, /分类目录[:：]\s*`?([^`\n]+)`?/) || fallbackCategory,
    reportDate: firstMatch(content, /报告日期[:：]\s*(\d{4}-\d{2}-\d{2})/) || firstDate(path.basename(file)),
  };
}

function parseMarkdownTables(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tables = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].trim().startsWith("|")) continue;
    const header = splitMarkdownRow(lines[i]);
    const sep = lines[i + 1] || "";
    if (!/^\s*\|?[\s:|-]+\|/.test(sep)) continue;
    const rows = [];
    i += 2;
    while (i < lines.length && lines[i].trim().startsWith("|")) {
      const cells = splitMarkdownRow(lines[i]);
      if (cells.length >= header.length) {
        rows.push(Object.fromEntries(header.map((key, index) => [cleanCell(key), cleanCell(cells[index])])));
      }
      i += 1;
    }
    tables.push(rows);
  }
  return tables;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.replace(/^\ufeff/, "").trim());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(header.map((key, index) => [key, r[index] ?? ""])));
}

function splitMarkdownRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function findHeader(header, names) {
  const idx = header.findIndex((cell) => names.some((name) => cleanCell(cell).includes(name)));
  return idx >= 0 ? idx : -1;
}

function tickerInFileName(ticker, fileName) {
  const escaped = ticker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[_\\-\\s])${escaped}([_\\-\\s]|$)`, "i").test(fileName);
}

function chooseLatestFile(files) {
  return [...files].sort((a, b) => {
    const da = firstDate(path.basename(a)) || "";
    const db = firstDate(path.basename(b)) || "";
    if (da !== db) return db.localeCompare(da);
    return path.basename(b).localeCompare(path.basename(a));
  })[0];
}

async function latestDateFromFiles(dir, pattern) {
  const files = await safeReadDir(dir);
  return files
    .map((name) => name.match(pattern)?.[1])
    .filter(Boolean)
    .sort()
    .at(-1) || "";
}

function cleanCell(value) {
  return value === undefined || value === null ? "" : String(value).replace(/`/g, "").trim();
}

function value(v) {
  return cleanCell(v);
}

function parseNumber(v) {
  const n = Number(String(v).replace(/[,+%]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function firstMatch(text, regex) {
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

function firstDate(text) {
  return firstMatch(text, /(\d{4}-\d{2}-\d{2})/) || firstMatch(text, /(\d{8})/).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
}

function normalizeName(value) {
  return cleanCell(value)
    .replace(/[\/\\]/g, "_")
    .replace(/、/g, "_")
    .replace(/\s+/g, "")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .toLowerCase();
}

function stableSlug(value) {
  return crypto.createHash("sha1").update(normalizeName(value)).digest("hex").slice(0, 14);
}

function relativePath(file) {
  return path.relative(PROJECT_ROOT, file).replace(/\\/g, "/");
}

function redactLocalPaths(text) {
  return text.replace(/D:\\drive\\Investment\\/gi, "Investment\\").replace(/D:\/drive\/Investment\//gi, "Investment/");
}

async function safeReadDir(dir) {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

async function readText(file) {
  return (await fs.readFile(file, "utf8")).replace(/^\ufeff/, "");
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
