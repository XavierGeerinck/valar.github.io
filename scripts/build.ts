import { cp, rm } from "node:fs/promises";
import { join } from "node:path";

const OUT_DIR = "dist";

// 1. Clean output directory
console.log("Cleaning output directory...");
await rm(OUT_DIR, { recursive: true, force: true });

// 2. Build the application
console.log("Building application...");
const result = await Bun.build({
    entrypoints: ["./index.tsx"],
    outdir: OUT_DIR,
    minify: true,
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
// Vite uses <script type="module" src="/index.tsx"></script>
// We replace it with <script src="./index.js"></script> relative path for GH pages
let updatedHtml = indexHtml.replace(
    /<script type="module" src=".*index\.tsx"><\/script>/,
    '<script type="module" src="./index.js"></script>'
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
        ''
    );
}

await Bun.write(join(OUT_DIR, "index.html"), updatedHtml);

console.log("Build complete!");
