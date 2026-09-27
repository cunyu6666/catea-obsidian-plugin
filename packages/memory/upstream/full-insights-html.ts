/**
 * [WHO]: renderFullInsightsHtml
 * [FROM]: Depends on ./i18n.js, ./types.js
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/full-insights-html.ts - pure HTML renderer for full insights report, includes Remix Icon and charts
 */


import { PROMPTS } from "./i18n.js";
import type {
	DeveloperPersona,
	FullInsightsChart,
	FullInsightsFriction,
	FullInsightsReport,
	FullInsightsFeatureToTry,
	FullInsightsUsagePattern,
	HumanInsight,
	PatternInsight,
	RootCauseInsight,
} from "./types.js";

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function formatDate(iso: string, locale: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
}

const CHART_COLORS: Record<string, string> = {
	tools: "#0891b2",
	languages: "#10b981",
	errors: "#dc2626",
};

function renderBarRows(chart: FullInsightsChart): string {
	if (!chart.rows.length) return "";
	const max = Math.max(...chart.rows.map((r) => r.value), 1);
	const color = CHART_COLORS[chart.id] ?? "#2563eb";
	return chart.rows
		.map(
			(row) =>
				`<div class="bar-row">
  <div class="bar-label" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</div>
  <div class="bar-track"><div class="bar-fill" style="width:${Math.max(8, Math.round((row.value / max) * 100))}%;background:${color}"></div></div>
  <div class="bar-value">${row.value}</div>
</div>`,
		)
		.join("");
}

export function renderFullInsightsHtml(report: FullInsightsReport, locale: string): string {
	const p = PROMPTS[locale] ?? PROMPTS.en;
	const lang = locale === "zh" ? "zh-CN" : "en";
	const enhancedReport = report as FullInsightsReport & {
		persona?: DeveloperPersona;
		humanInsights?: HumanInsight[];
		rootCauses?: RootCauseInsight[];
	};

	const sections: string[] = [];

	// TOC links (only for sections we might render)
	const tocLinks: string[] = [
		'<a href="#section-glance"><i class="ri-dashboard-line"></i> ' + escapeHtml(p.fullInsightsAtAGlance) + "</a>",
		'<a href="#section-work"><i class="ri-briefcase-4-line"></i> ' + escapeHtml(p.fullInsightsWorkOn) + "</a>",
	];
	if (enhancedReport.persona) {
		tocLinks.push(
			'<a href="#section-persona"><i class="ri-user-star-line"></i> ' +
				escapeHtml(p.humanInsightsSectionPersona) +
				"</a>",
		);
	}
	if (enhancedReport.humanInsights?.length) {
		tocLinks.push(
			'<a href="#section-human-insights"><i class="ri-robot-2-line"></i> ' +
				escapeHtml(p.humanInsightsSectionInsights) +
				"</a>",
		);
	}
	if (enhancedReport.rootCauses?.length) {
		tocLinks.push(
			'<a href="#section-root-causes"><i class="ri-stethoscope-line"></i> ' +
				escapeHtml(p.humanInsightsSectionRootCauses) +
				"</a>",
		);
	}
	if (report.charts.length) tocLinks.push('<a href="#section-charts"><i class="ri-bar-chart-box-line"></i> Charts</a>');
	if (report.wins.length) tocLinks.push('<a href="#section-wins"><i class="ri-trophy-line"></i> ' + escapeHtml(p.fullInsightsWins) + "</a>");
	if (report.frictions.length) tocLinks.push('<a href="#section-frictions"><i class="ri-error-warning-line"></i> ' + escapeHtml(p.fullInsightsFrictions) + "</a>");
	if (report.recommendations.length) tocLinks.push('<a href="#section-recommendations"><i class="ri-checkbox-circle-line"></i> ' + escapeHtml(p.fullInsightsRecommendations) + "</a>");
	if (report.featuresToTry.length) tocLinks.push('<a href="#section-features"><i class="ri-magic-line"></i> ' + escapeHtml(p.fullInsightsFeaturesToTry) + "</a>");
	if (report.usagePatterns.length) tocLinks.push('<a href="#section-patterns"><i class="ri-flow-chart"></i> ' + escapeHtml(p.fullInsightsUsagePatterns) + "</a>");

	// Stats row
	const statItems = [
		{ value: report.stats.totalSessions, label: "Sessions", icon: "ri-chat-3-line" },
		{ value: report.stats.episodes, label: "Episodes", icon: "ri-folder-line" },
		{ value: report.stats.knowledge, label: "Knowledge", icon: "ri-book-open-line" },
		{ value: report.stats.lessons, label: "Lessons", icon: "ri-lightbulb-line" },
		{ value: report.stats.work, label: "Work", icon: "ri-briefcase-line" },
		{ value: report.stats.facets, label: "Patterns/Struggles", icon: "ri-pie-chart-line" },
	];
	const statsHtml = `<section class="stats-row">
${statItems.map((s) => `<div class="stat"><i class="${s.icon} stat-icon"></i><div class="stat-value">${s.value}</div><div class="stat-label">${escapeHtml(s.label)}</div></div>`).join("\n")}
</section>`;

	// At a Glance
	const glanceHtml = `<section id="section-glance" class="at-a-glance">
  <h2 class="glance-title"><i class="ri-dashboard-line"></i> ${escapeHtml(p.fullInsightsAtAGlance)}</h2>
  <div class="glance-grid">
    <article class="glance-card"><h3><i class="ri-checkbox-circle-line"></i> What's working</h3><p>${escapeHtml(report.atAGlance.working)}</p></article>
    <article class="glance-card warn"><h3><i class="ri-error-warning-line"></i> What's hindering</h3><p>${escapeHtml(report.atAGlance.hindering)}</p></article>
    <article class="glance-card"><h3><i class="ri-lightbulb-line"></i> Quick wins</h3><p>${escapeHtml(report.atAGlance.quickWins)}</p></article>
    <article class="glance-card"><h3><i class="ri-rocket-line"></i> Ambitious</h3><p>${escapeHtml(report.atAGlance.ambitious)}</p></article>
  </div>
</section>`;

	let personaHtml = "";
	if (enhancedReport.persona) {
		const persona = enhancedReport.persona;
		personaHtml = `<section id="section-persona" class="section">
  <h2><i class="ri-user-star-line"></i> ${escapeHtml(p.humanInsightsSectionPersona)}</h2>
  <div class="persona-grid">
    <article class="persona-card persona-lead">
      <div class="persona-kicker">${escapeHtml(persona.summary)}</div>
      <div class="persona-text">${escapeHtml(persona.whatTheyDo)}</div>
      <div class="persona-text">${escapeHtml(persona.workStyle)}</div>
      <div class="persona-meta">${escapeHtml(persona.experienceLevel)}</div>
    </article>
    <article class="persona-card">
      <div class="persona-card-title">Strengths</div>
      <ul class="persona-list">${persona.superpowers.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </article>
    <article class="persona-card">
      <div class="persona-card-title">Watchouts</div>
      <ul class="persona-list">${persona.painPoints.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </article>
  </div>
</section>`;
	}

	let humanInsightsHtml = "";
	if (enhancedReport.humanInsights?.length) {
		humanInsightsHtml = `<section id="section-human-insights" class="section">
  <h2><i class="ri-robot-2-line"></i> ${escapeHtml(p.humanInsightsSectionInsights)}</h2>
  <div class="insight-review-list">
${enhancedReport.humanInsights
	.map(
		(insight) => `    <article class="insight-review-card priority-${escapeHtml(insight.utility)}">
  <div class="insight-review-header">
    <div class="insight-review-icon">${escapeHtml(insight.icon)}</div>
    <div>
      <div class="insight-review-title">${escapeHtml(insight.title)}</div>
      <div class="insight-review-priority">${escapeHtml(insight.utility.toUpperCase())}</div>
    </div>
  </div>
  <div class="insight-review-content">${escapeHtml(insight.content)}</div>
  ${insight.tags.length ? `<div class="insight-tags">${insight.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
</article>`,
	)
	.join("\n")}
  </div>
</section>`;
	}

	let rootCausesHtml = "";
	if (enhancedReport.rootCauses?.length) {
		rootCausesHtml = `<section id="section-root-causes" class="section">
  <h2><i class="ri-stethoscope-line"></i> ${escapeHtml(p.humanInsightsSectionRootCauses)}</h2>
  <div class="root-cause-list">
${enhancedReport.rootCauses
	.map(
		(item) => `    <article class="root-cause-card">
  <div class="root-cause-label">Recurring symptom</div>
  <div class="root-cause-title">${escapeHtml(item.symptom)}</div>
  <div class="root-cause-label">Likely cause</div>
  <div class="root-cause-body">${escapeHtml(item.rootCause)}</div>
  ${item.evidence.length ? `<div class="root-cause-label">Evidence</div><ul class="root-cause-evidence">${item.evidence.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}</ul>` : ""}
  <div class="root-cause-label">Recommended fix</div>
  <div class="root-cause-body">${escapeHtml(item.suggestion)}</div>
</article>`,
	)
	.join("\n")}
  </div>
</section>`;
	}

	// What You Work On
	let workHtml = "";
	if (report.projectAreas.length) {
		workHtml = `<section id="section-work" class="section">
  <h2><i class="ri-briefcase-4-line"></i> ${escapeHtml(p.fullInsightsWorkOn)}</h2>
  <div class="project-list">
${report.projectAreas
	.map(
		(a) => `    <article class="project-area">
  <div class="area-header">
    <span class="area-name">${escapeHtml(a.name)}</span>
    <span class="area-count">~${a.sessionCount} ${escapeHtml(p.fullInsightsSubtitleSessions)}</span>
  </div>
  <p class="area-desc">${escapeHtml(a.description)}</p>
</article>`,
	)
	.join("\n")}
  </div>
</section>`;
	}

	// Charts
	let chartsHtml = "";
	if (report.charts.length) {
		chartsHtml = `<section id="section-charts" class="section">
  <h2><i class="ri-bar-chart-box-line"></i> ${locale === "zh" ? "分布" : "Distribution"}</h2>
  <div class="charts-row">
${report.charts.map((chart) => `    <div class="chart-card">
  <div class="chart-title">${escapeHtml(chart.title)}</div>
  ${renderBarRows(chart)}
</div>`).join("\n")}
  </div>
</section>`;
	}

	// Wins
	let winsHtml = "";
	if (report.wins.length) {
		winsHtml = `<section id="section-wins" class="section">
  <h2><i class="ri-trophy-line"></i> ${escapeHtml(p.fullInsightsWins)}</h2>
  <div class="wins-list">
${report.wins.map((w) => `    <article class="big-win"><div class="big-win-title">${escapeHtml(w.title)}</div><div class="big-win-desc">${escapeHtml(w.description)}</div></article>`).join("\n")}
  </div>
</section>`;
	}

	// Frictions
	let frictionsHtml = "";
	if (report.frictions.length) {
		frictionsHtml = `<section id="section-frictions" class="section">
  <h2><i class="ri-error-warning-line"></i> ${escapeHtml(p.fullInsightsFrictions)}</h2>
  <div class="friction-list">
${report.frictions
	.map(
		(f) => `    <article class="friction-category">
  <div class="friction-title">${escapeHtml(f.title)}</div>
  <div class="friction-desc">${escapeHtml(f.description)}</div>
  ${f.examples?.length ? `<ul class="friction-examples">${f.examples.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>` : ""}
</article>`,
	)
	.join("\n")}
  </div>
</section>`;
	}

	// Recommendations
	let recHtml = "";
	if (report.recommendations.length) {
		recHtml = `<section id="section-recommendations" class="section">
  <h2><i class="ri-checkbox-circle-line"></i> ${escapeHtml(p.fullInsightsRecommendations)}</h2>
  <ul class="recommend-list">
${report.recommendations.map((r) => `    <li>${escapeHtml(r)}</li>`).join("\n")}
  </ul>
</section>`;
	}

	// Features to Try
	let featuresHtml = "";
	if (report.featuresToTry.length) {
		featuresHtml = `<section id="section-features" class="section">
  <h2><i class="ri-magic-line"></i> ${escapeHtml(p.fullInsightsFeaturesToTry)}</h2>
  <div class="features-section">
${report.featuresToTry
	.map(
		(f, i) => `    <article class="feature-card">
  <div class="feature-title">${escapeHtml(f.title)}</div>
  <div class="feature-oneliner">${escapeHtml(f.oneLiner)}</div>
  <div class="feature-why">${escapeHtml(f.whyForYou)}</div>
  ${f.exampleCode ? `<div class="feature-code"><code data-copy="feature-code-${i}">${escapeHtml(f.exampleCode)}</code><button type="button" class="copy-btn" data-copy-target="feature-code-${i}">${escapeHtml(p.fullInsightsCopy)}</button></div>` : ""}
</article>`,
	)
	.join("\n")}
  </div>
</section>`;
	}

	// Usage Patterns
	let patternsHtml = "";
	if (report.usagePatterns.length) {
		patternsHtml = `<section id="section-patterns" class="section">
  <h2><i class="ri-flow-chart"></i> ${escapeHtml(p.fullInsightsUsagePatterns)}</h2>
  <div class="patterns-section">
${report.usagePatterns
	.map(
		(u, i) => `    <article class="pattern-card">
  <div class="pattern-title">${escapeHtml(u.title)}</div>
  <div class="pattern-summary">${escapeHtml(u.summary)}</div>
  <div class="pattern-detail">${escapeHtml(u.detail)}</div>
  ${u.pastePrompt ? `<div class="copyable-prompt-section"><div class="prompt-label">${escapeHtml(p.fullInsightsCopy)}</div><div class="copyable-prompt-row"><code class="copyable-prompt" data-copy="pattern-prompt-${i}">${escapeHtml(u.pastePrompt)}</code><button type="button" class="copy-btn" data-copy-target="pattern-prompt-${i}">${escapeHtml(p.fullInsightsCopy)}</button></div></div>` : ""}
</article>`,
	)
	.join("\n")}
  </div>
</section>`;
	}

	// Behavioral patterns (raw list if any)
	let rawPatternsHtml = "";
	if (report.patterns.length) {
		rawPatternsHtml = `<section class="section">
  <h2><i class="ri-pie-chart-line"></i> ${escapeHtml(p.insightsSectionPatterns)}</h2>
  <ul class="pattern-list">
${report.patterns.slice(0, 8).map((pa) => `    <li><strong>${escapeHtml(pa.trigger)}</strong> → ${escapeHtml(pa.behavior)}</li>`).join("\n")}
  </ul>
</section>`;
	}

	const css = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;background:#f8fafc;color:#334155;line-height:1.65;padding:48px 24px}
.container{max-width:800px;margin:0 auto}
h1{font-size:32px;font-weight:700;color:#0f172a;margin-bottom:8px}
h2{font-size:20px;font-weight:600;color:#0f172a;margin-top:32px;margin-bottom:16px}
h2.glance-title{font-size:16px;margin-top:0;color:#92400e}
h2 .ri{vertical-align:middle;margin-right:6px}
.subtitle{color:#64748b;font-size:15px;margin-bottom:24px}
.nav-toc{display:flex;flex-wrap:wrap;gap:8px;margin:24px 0 32px;padding:16px;background:#fff;border-radius:8px;border:1px solid #e2e8f0}
.nav-toc a{font-size:12px;color:#64748b;text-decoration:none;padding:6px 12px;border-radius:6px;background:#f1f5f9;transition:all .15s}
.nav-toc a:hover{background:#e2e8f0;color:#334155}
.nav-toc .ri{margin-right:4px;vertical-align:middle}
.stats-row{display:flex;gap:24px;margin-bottom:32px;padding:20px 0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;flex-wrap:wrap}
.persona-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:16px}
.persona-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px}
.persona-lead{background:linear-gradient(135deg,#fff7ed 0%,#ffedd5 100%);border-color:#fdba74}
.persona-kicker{font-size:18px;font-weight:700;color:#9a3412;margin-bottom:10px}
.persona-text{font-size:14px;color:#334155;line-height:1.6;margin-bottom:8px}
.persona-meta{font-size:12px;color:#7c2d12;text-transform:uppercase;letter-spacing:.04em}
.persona-card-title{font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:10px}
.persona-list{margin:0;padding-left:18px}
.persona-list li{margin-bottom:8px;font-size:14px;color:#334155}
.insight-review-list,.root-cause-list{display:flex;flex-direction:column;gap:16px}
.insight-review-card{border-radius:10px;padding:18px;border:1px solid #dbeafe;background:#f8fbff}
.insight-review-card.priority-high{border-color:#93c5fd;background:#eff6ff}
.insight-review-card.priority-medium{border-color:#cbd5e1;background:#f8fafc}
.insight-review-card.priority-low{border-color:#d1fae5;background:#f0fdf4}
.insight-review-header{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.insight-review-icon{font-size:24px;line-height:1}
.insight-review-title{font-size:16px;font-weight:700;color:#0f172a}
.insight-review-priority{font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:.08em}
.insight-review-content{font-size:14px;color:#334155;line-height:1.7}
.insight-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.insight-tags span{font-size:11px;color:#475569;background:#e2e8f0;border-radius:999px;padding:4px 8px}
.root-cause-card{border-radius:10px;padding:18px;border:1px solid #fecaca;background:#fff7f7}
.root-cause-label{font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
.root-cause-title{font-size:16px;font-weight:700;color:#7f1d1d;margin-bottom:10px}
.root-cause-body{font-size:14px;color:#334155;line-height:1.7;margin-bottom:12px}
.root-cause-evidence{margin:0 0 12px 18px}
.root-cause-evidence li{margin-bottom:6px;font-size:13px;color:#475569}
.stat{text-align:center}
.stat-icon{font-size:20px;color:#64748b;display:block;margin-bottom:4px}
.stat-value{font-size:24px;font-weight:700;color:#0f172a}
.stat-label{font-size:11px;color:#64748b;text-transform:uppercase}
.at-a-glance{background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border:1px solid #f59e0b;border-radius:12px;padding:20px 24px;margin-bottom:32px}
.glance-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.glance-card{background:rgba(255,255,255,.6);border:1px solid rgba(245,158,11,.3);border-radius:8px;padding:14px}
.glance-card.warn{background:rgba(254,226,226,.7);border-color:#fca5a5}
.glance-card h3{font-size:13px;font-weight:600;color:#92400e;margin-bottom:8px}
.glance-card p{font-size:13px;color:#78350f;line-height:1.5;margin:0}
.section{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:24px}
.project-list,.wins-list,.friction-list{display:flex;flex-direction:column;gap:12px}
.project-area{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px}
.area-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.area-name{font-weight:600;font-size:15px;color:#0f172a}
.area-count{font-size:12px;color:#64748b;background:#f1f5f9;padding:2px 8px;border-radius:4px}
.area-desc{font-size:14px;color:#475569;line-height:1.5}
.charts-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px}
.chart-card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px}
.chart-title{font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;margin-bottom:12px}
.bar-row{display:flex;align-items:center;margin-bottom:6px}
.bar-label{width:100px;font-size:11px;color:#475569;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-track{flex:1;height:6px;background:#f1f5f9;border-radius:3px;margin:0 8px}
.bar-fill{height:100%;border-radius:3px}
.bar-value{width:28px;font-size:11px;font-weight:500;color:#64748b;text-align:right}
.big-win{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px}
.big-win-title{font-weight:600;font-size:15px;color:#166534;margin-bottom:8px}
.big-win-desc{font-size:14px;color:#15803d;line-height:1.5}
.friction-category{background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px}
.friction-title{font-weight:600;font-size:15px;color:#991b1b;margin-bottom:6px}
.friction-desc{font-size:13px;color:#7f1d1d;margin-bottom:10px}
.friction-examples{margin:0 0 0 20px;font-size:13px;color:#334155}
.recommend-list{margin:0;padding-left:20px}
.recommend-list li{margin-bottom:8px;font-size:14px;color:#334155}
.features-section,.patterns-section{display:flex;flex-direction:column;gap:12px}
.feature-card{background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px}
.pattern-card{background:#f0f9ff;border:1px solid #7dd3fc;border-radius:8px;padding:16px}
.feature-title,.pattern-title{font-weight:600;font-size:15px;color:#0f172a;margin-bottom:6px}
.feature-oneliner,.pattern-summary{font-size:14px;color:#475569;margin-bottom:8px}
.feature-why,.pattern-detail{font-size:13px;color:#334155;line-height:1.5}
.feature-code{background:#f8fafc;padding:12px;border-radius:6px;margin-top:12px;border:1px solid #e2e8f0;display:flex;align-items:flex-start;gap:8px}
.feature-code code{flex:1;font-family:monospace;font-size:12px;white-space:pre-wrap}
.copyable-prompt-section{margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0}
.copyable-prompt-row{display:flex;align-items:flex-start;gap:8px}
.copyable-prompt{flex:1;background:#f8fafc;padding:10px 12px;border-radius:4px;font-family:monospace;font-size:12px;color:#334155;border:1px solid #e2e8f0;white-space:pre-wrap;line-height:1.5}
.prompt-label{font-size:11px;font-weight:600;text-transform:uppercase;color:#64748b;margin-bottom:6px}
.copy-btn{background:#e2e8f0;border:none;border-radius:4px;padding:4px 8px;font-size:11px;cursor:pointer;color:#475569;flex-shrink:0}
.copy-btn:hover{background:#cbd5e1}
.pattern-list{margin:0;padding-left:20px}
.pattern-list li{margin-bottom:6px;font-size:14px;color:#334155}
footer{margin-top:32px;text-align:center;font-size:12px;color:#94a3b8}
@media (max-width:640px){.charts-row{grid-template-columns:1fr}.stats-row{justify-content:center}}
@media (max-width:900px){.persona-grid{grid-template-columns:1fr}}
`;

	const copyScript = `
document.querySelectorAll('.copy-btn').forEach(function(btn){
  btn.addEventListener('click', function(){
    var id = this.getAttribute('data-copy-target');
    var el = id ? document.querySelector('[data-copy="' + id + '"]') : null;
    if (el) {
      navigator.clipboard.writeText(el.textContent).then(function(){
        var t = btn.textContent;
        btn.textContent = '${escapeHtml(p.fullInsightsCopied)}';
        setTimeout(function(){ btn.textContent = t; }, 2000);
      });
    }
  });
});
`;

	return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(p.fullInsightsTitle)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link href="https://cdn.jsdelivr.net/npm/remixicon@4.9.0/fonts/remixicon.css" rel="stylesheet" />
  <style>${css}</style>
</head>
<body>
  <div class="container">
    <h1><i class="ri-file-list-3-line"></i> ${escapeHtml(p.fullInsightsTitle)}</h1>
    <p class="subtitle">${report.stats.totalSessions} ${escapeHtml(p.fullInsightsSubtitleSessions)} | ${escapeHtml(p.insightsGeneratedAt)}: ${escapeHtml(formatDate(report.generatedAt, locale))}</p>

    <nav class="nav-toc">
${tocLinks.map((link) => "      " + link).join("\n")}
    </nav>

${statsHtml}
${glanceHtml}
${workHtml}
${personaHtml}
${humanInsightsHtml}
${rootCausesHtml}
${chartsHtml}
${winsHtml}
${frictionsHtml}
${recHtml}
${featuresHtml}
${patternsHtml}
${rawPatternsHtml}

    <footer>${escapeHtml(p.fullInsightsGeneratedBy)} · ${escapeHtml(formatDate(report.generatedAt, locale))}</footer>
  </div>
  <script>${copyScript}</script>
</body>
</html>`;
}
