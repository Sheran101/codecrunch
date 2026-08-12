import { generatePoster } from "../src/poster.js";

const out = await generatePoster("BISTEC main hall", "Wednesday 6:00 PM", new Date().toISOString().slice(0, 10));
console.log("poster at", out);
