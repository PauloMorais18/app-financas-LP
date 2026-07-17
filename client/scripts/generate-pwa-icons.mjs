import {mkdir} from "node:fs/promises";
import {resolve} from "node:path";
import sharp from "sharp";

const root=resolve(import.meta.dirname,"..");
const source=resolve(root,"public/finanbase-icon.svg");
const output=resolve(root,"public/icons");
await mkdir(output,{recursive:true});
for(const size of [180,192,512])await sharp(source,{density:384}).resize(size,size).png({compressionLevel:9}).toFile(resolve(output,`finanbase-${size}.png`));
await sharp(source,{density:384}).resize(400,400).extend({top:56,bottom:56,left:56,right:56,background:"#1654df"}).png({compressionLevel:9}).toFile(resolve(output,"finanbase-maskable-512.png"));
