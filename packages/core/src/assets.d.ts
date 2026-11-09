// The web client's files, imported `with { type: "file" }` in web.ts: each is a path on disk
// (or inside the compiled binary).
declare module "*.png" {
  const path: string;
  export default path;
}
declare module "*.css" {
  const path: string;
  export default path;
}
declare module "*.webp" {
  const path: string;
  export default path;
}
declare module "*.woff2" {
  const path: string;
  export default path;
}
declare module "*.woff" {
  const path: string;
  export default path;
}
declare module "*.webmanifest" {
  const path: string;
  export default path;
}
declare module "*/static/app.js" {
  const path: string;
  export default path;
}
declare module "*/static/sw.js" {
  const path: string;
  export default path;
}
