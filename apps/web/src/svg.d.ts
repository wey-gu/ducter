// D314: the brand marks are imported as text (Bun: with { type: "text" }) and drawn inline.
declare module "*.svg" {
  const svg: string;
  export default svg;
}
