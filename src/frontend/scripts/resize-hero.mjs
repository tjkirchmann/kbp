import sharp from 'sharp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = join(__dirname, '../../../main-home-picture.jpg')
const out = join(__dirname, '../src/assets/images')

await sharp(src).resize(896).jpeg({ quality: 82 }).toFile(join(out, 'main-home-picture-896w.jpg'))
console.log('896w done')
await sharp(src).resize(1792).jpeg({ quality: 82 }).toFile(join(out, 'main-home-picture-1792w.jpg'))
console.log('1792w done')
