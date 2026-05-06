// Twitter card uses the same 1200x630 OG visual.
// We re-export the renderer + alt/size/contentType, but declare `runtime`
// directly here so Next can static-generate this route.
export { default, alt, size, contentType } from "./opengraph-image";
