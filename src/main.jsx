import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  AlertTriangle,
  ArrowDownUp,
  BarChart3,
  Building2,
  Download,
  FileText,
  Gauge,
  Home,
  Layers,
  LineChart,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Table2,
  X,
} from "lucide-react";
import "./styles.css";

const DATA_BASE = "./data";

const rankingLabels = {
  balanced: "平衡",
  aggressive: "激进",
  veryAggressive: "非常激进",
  crossCheck: "交叉检查",
};

const navItems = [
  { id: "overview", label: "首页", icon: Home },
  { id: "companies", label: "公司", icon: Building2 },
  { id: "industries", label: "行业", icon: Layers },
  { id: "rankings", label: "排名", icon: BarChart3 },
  { id: "features", label: "特征量化", icon: Gauge },
  { id: "quality", label: "质量告警", icon: ShieldCheck },
];

function formatValue(value, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/[+$,%]/g, "").replace(/,/g, "").trim();
  if (!cleaned || cleaned === "-" || cleaned.toLowerCase() === "nan") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function sortRows(rows, sortKey, direction) {
  if (!sortKey) return rows;
  return [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const an = toNumber(av);
    const bn = toNumber(bv);
    let cmp;
    if (an !== null && bn !== null) {
      cmp = an - bn;
    } else if (an === null && bn !== null) {
      return 1;
    } else if (an !== null && bn === null) {
      return -1;
    } else {
      cmp = formatValue(av, "").localeCompare(formatValue(bv, ""), "zh-Hans-CN");
    }
    return direction === "asc" ? cmp : -cmp;
  });
}

function csvEscape(value) {
  const s = formatValue(value, "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename, rows, columns) {
  const content = [
    columns.map((c) => csvEscape(c.label)).join(","),
    ...rows.map((row) => columns.map((c) => csvEscape(row[c.key])).join(",")),
  ].join("\n");
  const blob = new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function useData() {
  const [state, setState] = useState({ loading: true, error: null });

  useEffect(() => {
    async function load() {
      try {
        const [meta, companies, industries, rankings, features, quality] = await Promise.all(
          ["meta", "companies", "industries", "rankings", "features", "quality"].map((name) =>
            fetch(`${DATA_BASE}/${name}.json`).then((r) => {
              if (!r.ok) throw new Error(`${name}.json ${r.status}`);
              return r.json();
            }),
          ),
        );
        setState({ loading: false, error: null, meta, companies, industries, rankings, features, quality });
      } catch (error) {
        setState({ loading: false, error: error.message });
      }
    }
    load();
  }, []);

  return state;
}

function App() {
  const data = useData();
  const [view, setView] = useState("overview");
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [selectedIndustry, setSelectedIndustry] = useState(null);

  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#\/?/, "");
      if (!hash) return;
      const [kind, id] = hash.split("/");
      if (kind === "company" && id) {
        setSelectedCompany(decodeURIComponent(id));
        setView("companies");
      } else if (kind === "industry" && id) {
        setSelectedIndustry(decodeURIComponent(id));
        setView("industries");
      } else if (navItems.some((item) => item.id === kind)) {
        setView(kind);
      }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  if (data.loading) return <LoadingScreen />;
  if (data.error) return <ErrorScreen error={data.error} />;

  const ranking = data.rankings.runs.balanced?.rows || [];
  const rankingByTicker = Object.fromEntries(ranking.map((row) => [row.ticker, row]));

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <LineChart size={22} />
          <div>
            <strong>Investment</strong>
            <span>Research Dashboard</span>
          </div>
        </div>
        <nav className="nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "nav-item active" : "nav-item"}
                onClick={() => {
                  setView(item.id);
                  window.location.hash = item.id;
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-meta">
          <span>数据生成</span>
          <strong>{data.meta.generatedAtDisplay}</strong>
        </div>
      </aside>

      <main className="main">
        {view === "overview" && <Overview data={data} setView={setView} />}
        {view === "companies" && (
          <Companies
            data={data}
            rankingByTicker={rankingByTicker}
            selectedTicker={selectedCompany}
            setSelectedTicker={setSelectedCompany}
          />
        )}
        {view === "industries" && (
          <Industries
            data={data}
            rankingByTicker={rankingByTicker}
            selectedSlug={selectedIndustry}
            setSelectedSlug={setSelectedIndustry}
          />
        )}
        {view === "rankings" && <Rankings data={data} />}
        {view === "features" && <Features data={data} rankingByTicker={rankingByTicker} />}
        {view === "quality" && <Quality data={data} />}
      </main>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="center-screen">
      <LineChart size={30} />
      <p>正在加载研究数据</p>
    </div>
  );
}

function ErrorScreen({ error }) {
  return (
    <div className="center-screen error">
      <AlertTriangle size={30} />
      <p>数据加载失败：{error}</p>
      <span>请先运行 npm run build:data</span>
    </div>
  );
}

function PageHeader({ eyebrow, title, actions }) {
  return (
    <header className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      {actions ? <div className="header-actions">{actions}</div> : null}
    </header>
  );
}

function Overview({ data, setView }) {
  const balanced = data.rankings.runs.balanced?.rows || [];
  const topRows = balanced.slice(0, 8);
  const alerts = data.quality.alerts.slice(0, 6);

  return (
    <>
      <PageHeader eyebrow="只读研究看板" title="AI 产业链公司、行业与排名" />
      <section className="stat-grid">
        <Stat icon={Building2} label="公司数" value={data.meta.companyCount} note={`有报告 ${data.meta.companyReportCount}`} />
        <Stat icon={Layers} label="行业数" value={data.meta.industryCount} note={`有报告 ${data.meta.industryReportCount}`} />
        <Stat icon={BarChart3} label="最新排名日期" value={data.meta.latestRankingDate || "-"} note="投资排序" />
        <Stat icon={Table2} label="最新金融数据" value={data.meta.latestFinancialDate || "-"} note="每日金融数据" />
      </section>

      <section className="dashboard-grid">
        <div className="panel span-2">
          <PanelTitle icon={BarChart3} title="平衡口径 Top 8" action={<TextButton onClick={() => setView("rankings")}>查看排名</TextButton>} />
          <DenseTable
            rows={topRows}
            columns={[
              { key: "rank", label: "Rank", className: "num" },
              { key: "ticker", label: "Ticker" },
              { key: "name", label: "公司" },
              { key: "tier", label: "Tier" },
              { key: "expectedReturn", label: "预期收益", className: "num" },
              { key: "score", label: "Score", className: "num" },
            ]}
            onRowClick={(row) => {
              window.location.hash = `company/${encodeURIComponent(row.ticker)}`;
            }}
          />
        </div>
        <div className="panel">
          <PanelTitle icon={AlertTriangle} title="质量告警" action={<TextButton onClick={() => setView("quality")}>查看全部</TextButton>} />
          <div className="alert-list">
            {alerts.length ? (
              alerts.map((alert, index) => <AlertItem key={`${alert.type}-${index}`} alert={alert} />)
            ) : (
              <p className="muted">没有发现阻断性告警。</p>
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <PanelTitle icon={Gauge} title="特征量化覆盖" />
        <div className="feature-strip">
          {data.features.features.slice(0, 52).map((feature) => (
            <span key={feature.id} className="feature-chip" title={feature.name}>
              {feature.id}
            </span>
          ))}
        </div>
      </section>
    </>
  );
}

function Stat({ icon: Icon, label, value, note }) {
  return (
    <div className="stat">
      <div className="stat-icon">
        <Icon size={20} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{note}</em>
    </div>
  );
}

function PanelTitle({ icon: Icon, title, action }) {
  return (
    <div className="panel-title">
      <div>
        <Icon size={18} />
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function TextButton({ children, onClick }) {
  return (
    <button className="text-button" onClick={onClick}>
      {children}
    </button>
  );
}

function FilterBar({ children }) {
  return <div className="filter-bar">{children}</div>;
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="search-box">
      <Search size={16} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function SelectBox({ value, onChange, options, label }) {
  return (
    <label className="select-box">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Companies({ data, rankingByTicker, selectedTicker, setSelectedTicker }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [tier, setTier] = useState("all");
  const [sortKey, setSortKey] = useState("rank");
  const [sortDirection, setSortDirection] = useState("asc");

  const rows = useMemo(() => {
    const merged = data.companies.map((company) => {
      const rank = rankingByTicker[company.ticker] || {};
      return {
        ...company,
        rank: rank.rank ?? null,
        tier: rank.tier || "未评分",
        expectedReturn: rank.expectedReturn || "",
        score: rank.score || "",
        certainty: rank.certainty || "",
        protection: rank.protection || "",
        pe: rank.pe || "",
        fpe: rank.fpe || "",
        ps: rank.ps || "",
        iv: rank.iv || "",
        marketCap: rank.marketCap || "",
      };
    });
    return sortRows(
      merged.filter((row) => {
        const q = query.trim().toLowerCase();
        const matchesQuery =
          !q ||
          [row.ticker, row.name, row.category].some((value) => formatValue(value, "").toLowerCase().includes(q));
        const matchesCategory = category === "all" || row.category === category;
        const matchesTier = tier === "all" || row.tier === tier;
        return matchesQuery && matchesCategory && matchesTier;
      }),
      sortKey,
      sortDirection,
    );
  }, [data.companies, rankingByTicker, query, category, tier, sortKey, sortDirection]);

  const selected = selectedTicker ? data.companies.find((c) => c.ticker === selectedTicker) : null;
  const categories = [...new Set(data.companies.map((c) => c.category))].sort();
  const tiers = [...new Set(Object.values(rankingByTicker).map((r) => r.tier).filter(Boolean))].sort();
  const columns = companyColumns();

  return (
    <>
      <PageHeader
        eyebrow="公司列表"
        title="公司调研与投资排序"
        actions={
          <IconButton
            label="导出当前列表"
            icon={Download}
            onClick={() => downloadCsv("companies.csv", rows, columns)}
          />
        }
      />
      <FilterBar>
        <SearchBox value={query} onChange={setQuery} placeholder="搜索 ticker、公司、分类" />
        <SelectBox
          label="分类"
          value={category}
          onChange={setCategory}
          options={[{ value: "all", label: "全部分类" }, ...categories.map((c) => ({ value: c, label: c }))]}
        />
        <SelectBox
          label="Tier"
          value={tier}
          onChange={setTier}
          options={[{ value: "all", label: "全部 Tier" }, ...tiers.map((t) => ({ value: t, label: t }))]}
        />
      </FilterBar>
      <div className={selected ? "split-view" : ""}>
        <div className="panel table-panel">
          <SortableTable
            rows={rows}
            columns={columns}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={(key) => {
              setSortDirection(sortKey === key && sortDirection === "asc" ? "desc" : "asc");
              setSortKey(key);
            }}
            onRowClick={(row) => {
              setSelectedTicker(row.ticker);
              window.location.hash = `company/${encodeURIComponent(row.ticker)}`;
            }}
          />
        </div>
        {selected ? (
          <CompanyDetail
            company={selected}
            data={data}
            rankingByTicker={rankingByTicker}
            onClose={() => {
              setSelectedTicker(null);
              window.location.hash = "companies";
            }}
          />
        ) : null}
      </div>
    </>
  );
}

function companyColumns() {
  return [
    { key: "rank", label: "Rank", className: "num" },
    { key: "tier", label: "Tier" },
    { key: "ticker", label: "Ticker" },
    { key: "name", label: "公司" },
    { key: "category", label: "分类" },
    { key: "expectedReturn", label: "预期收益", className: "num" },
    { key: "score", label: "Score", className: "num" },
    { key: "certainty", label: "确定性", className: "num" },
    { key: "protection", label: "保护力", className: "num" },
    { key: "pe", label: "PE", className: "num" },
    { key: "fpe", label: "FPE", className: "num" },
    { key: "ps", label: "PS", className: "num" },
    { key: "iv", label: "IV", className: "num" },
    { key: "marketCap", label: "市值", className: "num" },
  ];
}

function CompanyDetail({ company, data, rankingByTicker, onClose }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const rank = rankingByTicker[company.ticker] || {};
  const featureRows = data.features.scoresByTicker[company.ticker] || [];
  const relatedIndustries = data.industries.filter((industry) => company.relatedIndustrySlugs.includes(industry.slug));

  useEffect(() => {
    let active = true;
    setReport(null);
    if (!company.report?.dataFile) return;
    setLoading(true);
    fetch(`${DATA_BASE}/${company.report.dataFile}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active) setReport(json);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [company.ticker, company.report?.dataFile]);

  return (
    <aside className="detail-panel">
      <button className="close-button" onClick={onClose} aria-label="关闭公司详情">
        <X size={18} />
      </button>
      <div className="detail-heading">
        <span>{company.ticker}</span>
        <h2>{company.name}</h2>
        <p>{company.category}</p>
      </div>
      <div className="mini-grid">
        <Mini label="Rank" value={rank.rank} />
        <Mini label="Tier" value={rank.tier} />
        <Mini label="预期收益" value={rank.expectedReturn} />
        <Mini label="Score" value={rank.score} />
        <Mini label="PE/FPE" value={`${formatValue(rank.pe)}/${formatValue(rank.fpe)}`} />
        <Mini label="PS / IV" value={`${formatValue(rank.ps)} / ${formatValue(rank.iv)}`} />
        <Mini label="市值" value={rank.marketCap} />
        <Mini label="报告日期" value={company.report?.reportDate} />
      </div>
      <SectionBlock title="源文件">
        {company.report ? (
          <code className="path-code">{company.report.sourcePath}</code>
        ) : (
          <p className="muted">未匹配到正式公司报告。</p>
        )}
      </SectionBlock>
      <SectionBlock title="相关行业">
        <div className="tag-list">
          {relatedIndustries.length ? (
            relatedIndustries.map((industry) => <span key={industry.slug}>{industry.name}</span>)
          ) : (
            <span>暂无映射</span>
          )}
        </div>
      </SectionBlock>
      <SectionBlock title="特征分 Top 10">
        <DenseTable
          rows={featureRows
            .filter((row) => row.score !== null)
            .sort((a, b) => Number(b.score) - Number(a.score))
            .slice(0, 10)}
          columns={[
            { key: "featureId", label: "ID" },
            { key: "featureName", label: "特征" },
            { key: "score", label: "分数", className: "num" },
            { key: "confidence", label: "置信度" },
          ]}
        />
      </SectionBlock>
      <SectionBlock title="公司报告">
        {loading ? <p className="muted">正在加载报告...</p> : null}
        {report ? <MarkdownView markdown={report.markdown} /> : !loading ? <p className="muted">没有可渲染报告。</p> : null}
      </SectionBlock>
    </aside>
  );
}

function Mini({ label, value }) {
  return (
    <div className="mini">
      <span>{label}</span>
      <strong>{formatValue(value)}</strong>
    </div>
  );
}

function SectionBlock({ title, children }) {
  return (
    <section className="section-block">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Industries({ data, rankingByTicker, selectedSlug, setSelectedSlug }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const selected = selectedSlug ? data.industries.find((i) => i.slug === selectedSlug) : null;
  const categories = [...new Set(data.industries.map((i) => i.category))].sort();
  const rows = data.industries.filter((row) => {
    const q = query.trim().toLowerCase();
    return (
      (!q || [row.name, row.category].some((value) => formatValue(value, "").toLowerCase().includes(q))) &&
      (category === "all" || row.category === category)
    );
  });

  return (
    <>
      <PageHeader eyebrow="行业列表" title="行业调研与相关公司" />
      <FilterBar>
        <SearchBox value={query} onChange={setQuery} placeholder="搜索行业、分类" />
        <SelectBox
          label="分类"
          value={category}
          onChange={setCategory}
          options={[{ value: "all", label: "全部分类" }, ...categories.map((c) => ({ value: c, label: c }))]}
        />
      </FilterBar>
      <div className={selected ? "split-view" : ""}>
        <div className="panel table-panel">
          <DenseTable
            rows={rows}
            columns={[
              { key: "name", label: "行业名称" },
              { key: "category", label: "分类" },
              { key: "companyCount", label: "相关公司", className: "num" },
              { key: "reportDate", label: "报告日期" },
              { key: "hasReportText", label: "报告" },
            ]}
            onRowClick={(row) => {
              setSelectedSlug(row.slug);
              window.location.hash = `industry/${encodeURIComponent(row.slug)}`;
            }}
          />
        </div>
        {selected ? (
          <IndustryDetail
            industry={selected}
            data={data}
            rankingByTicker={rankingByTicker}
            onClose={() => {
              setSelectedSlug(null);
              window.location.hash = "industries";
            }}
          />
        ) : null}
      </div>
    </>
  );
}

function IndustryDetail({ industry, data, rankingByTicker, onClose }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const companies = data.companies
    .filter((company) => company.relatedIndustrySlugs.includes(industry.slug))
    .map((company) => ({ ...company, ...(rankingByTicker[company.ticker] || {}) }))
    .sort((a, b) => (toNumber(a.rank) ?? 9999) - (toNumber(b.rank) ?? 9999));

  useEffect(() => {
    let active = true;
    setReport(null);
    if (!industry.report?.dataFile) return;
    setLoading(true);
    fetch(`${DATA_BASE}/${industry.report.dataFile}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active) setReport(json);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [industry.slug, industry.report?.dataFile]);

  return (
    <aside className="detail-panel">
      <button className="close-button" onClick={onClose} aria-label="关闭行业详情">
        <X size={18} />
      </button>
      <div className="detail-heading">
        <span>行业</span>
        <h2>{industry.name}</h2>
        <p>{industry.category}</p>
      </div>
      <div className="mini-grid">
        <div className="mini">
          <span>所属大类</span>
          <strong>{industry.category}</strong>
        </div>
        <div className="mini">
          <span>相关公司</span>
          <strong>{companies.length}</strong>
        </div>
      </div>
      <SectionBlock title="行业内公司排名">
        <DenseTable
          rows={companies.slice(0, 30)}
          columns={[
            { key: "rank", label: "Rank", className: "num" },
            { key: "ticker", label: "Ticker" },
            { key: "name", label: "公司" },
            { key: "expectedReturn", label: "预期收益", className: "num" },
            { key: "score", label: "Score", className: "num" },
          ]}
          onRowClick={(row) => {
            window.location.hash = `company/${encodeURIComponent(row.ticker)}`;
          }}
        />
      </SectionBlock>
      <SectionBlock title="源文件">
        {industry.report ? <code className="path-code">{industry.report.sourcePath}</code> : <p className="muted">未匹配到正式行业报告。</p>}
      </SectionBlock>
      <SectionBlock title="行业报告">
        {loading ? <p className="muted">正在加载报告...</p> : null}
        {report ? <MarkdownView markdown={report.markdown} /> : !loading ? <p className="muted">没有可渲染报告。</p> : null}
      </SectionBlock>
    </aside>
  );
}

function Rankings({ data }) {
  const [kind, setKind] = useState("balanced");
  const [range, setRange] = useState("top");
  const [sortKey, setSortKey] = useState("rank");
  const [sortDirection, setSortDirection] = useState("asc");
  const run = data.rankings.runs[kind];
  const baseRows = run?.rows || [];
  const viewRows = range === "bottom" ? [...baseRows].slice(-50).reverse() : baseRows.slice(0, 80);
  const rows = sortRows(viewRows, sortKey, sortDirection);
  const columns = rankingColumns(kind);

  return (
    <>
      <PageHeader
        eyebrow="投资排序"
        title={`${rankingLabels[kind]}口径`}
        actions={
          <IconButton label="导出当前排名" icon={Download} onClick={() => downloadCsv(`${kind}-ranking.csv`, rows, columns)} />
        }
      />
      <FilterBar>
        <SelectBox
          label="口径"
          value={kind}
          onChange={(value) => {
            setKind(value);
            setSortKey("rank");
            setSortDirection("asc");
          }}
          options={Object.entries(rankingLabels).map(([value, label]) => ({ value, label }))}
        />
        <SelectBox
          label="范围"
          value={range}
          onChange={setRange}
          options={[
            { value: "top", label: "Top 80" },
            { value: "bottom", label: "Bottom 50" },
          ]}
        />
        <div className="data-note">来源：{run?.sourcePath || "-"}</div>
      </FilterBar>
      <div className="panel table-panel">
        <SortableTable
          rows={rows}
          columns={columns}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={(key) => {
            setSortDirection(sortKey === key && sortDirection === "asc" ? "desc" : "asc");
            setSortKey(key);
          }}
          onRowClick={(row) => {
            window.location.hash = `company/${encodeURIComponent(row.ticker)}`;
          }}
        />
      </div>
    </>
  );
}

function rankingColumns(kind) {
  const common = [
    { key: "rank", label: "Rank", className: "num" },
    { key: "tier", label: "Tier" },
    { key: "ticker", label: "Ticker" },
    { key: "name", label: "公司" },
    { key: "category", label: "分类" },
    { key: "expectedReturn", label: "预期收益", className: "num" },
    { key: "score", label: "Score", className: "num" },
    { key: "certainty", label: "确定性", className: "num" },
    { key: "protection", label: "保护力", className: "num" },
    { key: "pe", label: "PE", className: "num" },
    { key: "fpe", label: "FPE", className: "num" },
    { key: "ps", label: "PS", className: "num" },
    { key: "iv", label: "IV", className: "num" },
    { key: "marketCap", label: "市值", className: "num" },
  ];
  if (kind === "crossCheck") {
    return [...common, { key: "auditTag", label: "审计标签" }, { key: "auditNote", label: "审计说明" }];
  }
  return common;
}

function Features({ data, rankingByTicker }) {
  const [featureId, setFeatureId] = useState(data.features.features[0]?.id || "");
  const [query, setQuery] = useState("");
  const feature = data.features.features.find((f) => f.id === featureId);
  const rows = (data.features.byFeature[featureId] || [])
    .filter((row) => {
      const q = query.trim().toLowerCase();
      return !q || [row.ticker, row.companyName, row.category].some((value) => formatValue(value, "").toLowerCase().includes(q));
    })
    .map((row) => ({ ...row, rankOverall: rankingByTicker[row.ticker]?.rank || "" }))
    .sort((a, b) => Number(a.rank) - Number(b.rank));

  const top = rows.filter((r) => r.score !== null).sort((a, b) => Number(b.score) - Number(a.score)).slice(0, 15);
  const bottom = rows.filter((r) => r.score !== null).sort((a, b) => Number(a.score) - Number(b.score)).slice(0, 15);
  const heatmapRows = rows.slice(0, 80);

  return (
    <>
      <PageHeader eyebrow="特征量化" title="52 个因子评分" />
      <FilterBar>
        <SelectBox
          label="特征"
          value={featureId}
          onChange={setFeatureId}
          options={data.features.features.map((f) => ({ value: f.id, label: `${f.id} ${f.name}` }))}
        />
        <SearchBox value={query} onChange={setQuery} placeholder="搜索公司" />
        <div className="data-note">评分日期：{feature?.date || "-"}</div>
      </FilterBar>

      <section className="dashboard-grid">
        <div className="panel">
          <PanelTitle icon={ArrowDownUp} title="Top 15" />
          <DenseTable rows={top} columns={featureColumns()} />
        </div>
        <div className="panel">
          <PanelTitle icon={ArrowDownUp} title="Bottom 15" />
          <DenseTable rows={bottom} columns={featureColumns()} />
        </div>
      </section>

      <section className="panel table-panel">
        <PanelTitle icon={SlidersHorizontal} title="公司-特征热力图" />
        <div className="heatmap-wrap">
          <table className="heatmap">
            <thead>
              <tr>
                <th>公司</th>
                {data.features.features.map((f) => (
                  <th key={f.id} title={f.name}>
                    {f.id}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmapRows.map((row) => {
                const byId = data.features.scoreIndex[row.ticker] || {};
                return (
                  <tr key={row.ticker}>
                    <td>
                      <button onClick={() => (window.location.hash = `company/${encodeURIComponent(row.ticker)}`)}>
                        {row.ticker}
                      </button>
                    </td>
                    {data.features.features.map((f) => {
                      const score = byId[f.id]?.score;
                      return (
                        <td key={f.id}>
                          <span className="heat-cell" style={{ background: heatColor(score) }} title={`${f.id} ${formatValue(score)}`}>
                            {formatValue(score, "")}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function featureColumns() {
  return [
    { key: "rank", label: "因子排名", className: "num" },
    { key: "rankOverall", label: "总榜", className: "num" },
    { key: "ticker", label: "Ticker" },
    { key: "companyName", label: "公司" },
    { key: "score", label: "分数", className: "num" },
    { key: "evidenceGrade", label: "证据" },
    { key: "confidence", label: "置信度" },
  ];
}

function heatColor(score) {
  const n = toNumber(score);
  if (n === null) return "#eef1f5";
  if (n >= 8) return "#0f9f6e";
  if (n >= 6.5) return "#76b041";
  if (n >= 5) return "#d5a11e";
  if (n >= 3.5) return "#e27730";
  return "#cf3f4f";
}

function Quality({ data }) {
  return (
    <>
      <PageHeader eyebrow="数据质量" title="覆盖、重复和过期检查" />
      <section className="stat-grid">
        <Stat icon={Building2} label="索引公司" value={data.quality.summary.companyIndexCount} note={`报告唯一 ${data.quality.summary.companyReportUnique}`} />
        <Stat icon={Layers} label="索引行业" value={data.quality.summary.industryIndexCount} note={`报告唯一 ${data.quality.summary.industryReportUnique}`} />
        <Stat icon={Gauge} label="特征文件" value={data.quality.summary.featureFileCount} note="F01-F52" />
        <Stat icon={AlertTriangle} label="告警数" value={data.quality.alerts.length} note="含提示项" />
      </section>
      <section className="panel">
        <PanelTitle icon={AlertTriangle} title="告警清单" />
        <div className="quality-list">
          {data.quality.alerts.map((alert, index) => (
            <AlertItem key={`${alert.type}-${index}`} alert={alert} wide />
          ))}
        </div>
      </section>
    </>
  );
}

function AlertItem({ alert, wide }) {
  return (
    <div className={wide ? "alert-item wide" : "alert-item"}>
      <span className={`severity ${alert.severity}`}>{alert.severity}</span>
      <div>
        <strong>{alert.title}</strong>
        <p>{alert.message}</p>
      </div>
    </div>
  );
}

function IconButton({ label, icon: Icon, onClick }) {
  return (
    <button className="icon-button" onClick={onClick} title={label} aria-label={label}>
      <Icon size={17} />
      <span>{label}</span>
    </button>
  );
}

function DenseTable({ rows, columns, onRowClick }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.className || ""}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.ticker || row.slug || row.name || index}-${index}`} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map((column) => (
                <td key={column.key} className={column.className || ""}>
                  {formatValue(row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortableTable({ rows, columns, sortKey, sortDirection, onSort, onRowClick }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.className || ""}>
                <button onClick={() => onSort(column.key)}>
                  {column.label}
                  {sortKey === column.key ? <span>{sortDirection === "asc" ? "↑" : "↓"}</span> : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.ticker || row.name}-${index}`} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map((column) => (
                <td key={column.key} className={column.className || ""}>
                  {formatValue(row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarkdownView({ markdown }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(markdown || "")), [markdown]);
  return <article className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

createRoot(document.getElementById("root")).render(<App />);
