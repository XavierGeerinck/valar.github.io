import { cp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { IDEAS } from "../generated-ideas";
import { USER_CONFIG } from "../config";

const OUT_DIR = "dist";
const BASE_URL = "https://paperlens.io"; // Updated based on user request

// 1. Clean output directory
console.log("Cleaning output directory...");
await rm(OUT_DIR, { recursive: true, force: true });

// 2. Build the application
console.log("Building application...");
const result = await Bun.build({
	entrypoints: ["./index.tsx"],
	outdir: OUT_DIR,
	minify: true,
	target: "browser",
	// We don't need to split chunks manually as Bun does a good job,
	// but for a single page app, a single bundle is often fine or default splitting.
	naming: "index.js",
});

if (!result.success) {
	console.error("Build failed");
	for (const message of result.logs) {
		console.error(message);
	}
	process.exit(1);
}

// 3. Copy static assets
console.log("Copying static assets...");

// Copy public folder contents if it exists
try {
	await cp("public", OUT_DIR, { recursive: true });
} catch (e) {
	// It's okay if public folder doesn't exist or is empty
	console.log("No public folder found or error copying, skipping...");
}

// 4. Process and copy index.html
console.log("Processing index.html...");
const indexHtml = await Bun.file("index.html").text();

// Create new File with updated script tag
// We replace the .tsx script with the bundled .js script
// Use absolute path for script to support nested routes (SSG)
let updatedHtml = indexHtml.replace(
	/<script type="module" src=".*index\.tsx"><\/script>/,
	'<script type="module" src="/index.js"></script>',
);

// Remove importmap if it exists
updatedHtml = updatedHtml.replace(
	/<script type="importmap">[\s\S]*?<\/script>/,
	"",
);

// Handle index.css
const cssFile = Bun.file("index.css");
if (await cssFile.exists()) {
	try {
		await cp("index.css", join(OUT_DIR, "index.css"));
	} catch (e) {
		console.error("Failed to copy index.css", e);
	}
} else {
	console.log("index.css not found, removing link...");
	updatedHtml = updatedHtml.replace(
		/<link rel="stylesheet" href="\/index.css">/,
		"",
	);
}

// 5. Generate Static Routes for SEO (SSG)
console.log("Generating static routes for SEO...");

function injectMeta(html: string, { title, description, image, url }: any) {
	let newHtml = html;
	// Replace title
	newHtml = newHtml.replace(/<title>.*<\/title>/, `<title>${title}</title>`);

	const replaceMeta = (
		attr: "name" | "property",
		key: string,
		content: string,
	) => {
		const escapedContent = content.replace(/"/g, "&quot;");
		const regex = new RegExp(`<meta ${attr}="${key}" content=".*?" />`);
		if (regex.test(newHtml)) {
			newHtml = newHtml.replace(
				regex,
				`<meta ${attr}="${key}" content="${escapedContent}" />`,
			);
		} else {
			newHtml = newHtml.replace(
				"</head>",
				`    <meta ${attr}="${key}" content="${escapedContent}" />\n  </head>`,
			);
		}
	};

	replaceMeta("name", "description", description);
	replaceMeta("property", "og:title", title);
	replaceMeta("property", "og:description", description);
	replaceMeta("property", "og:image", image);
	replaceMeta("property", "og:type", "article");
	replaceMeta("property", "og:url", url);
	replaceMeta("name", "twitter:card", "summary_large_image");
	replaceMeta("name", "twitter:title", title);
	replaceMeta("name", "twitter:description", description);
	replaceMeta("name", "twitter:image", image);

	return newHtml;
}

// Generate idea pages
for (const idea of IDEAS) {
	const ideaDir = join(OUT_DIR, "idea", idea.id);
	await mkdir(ideaDir, { recursive: true });

	const ideaHtml = injectMeta(updatedHtml, {
		title: `${idea.title} | ${USER_CONFIG.lab}`,
		description: idea.subtitle,
		image: idea.coverImage,
		url: `${BASE_URL}/idea/${idea.id}`,
	});

	await Bun.write(join(ideaDir, "index.html"), ideaHtml);
}

// Create 404.html for GitHub Pages SPA fallback
await Bun.write(join(OUT_DIR, "404.html"), updatedHtml);

await Bun.write(join(OUT_DIR, "index.html"), updatedHtml);

console.log("Build complete!");
