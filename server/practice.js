const http = require("http")
const path = require("path")
const fse = require("fs-extra") // 文件fs模块的拓展包 

// 合并文件快的目录
const UPLOAD_DIR = path.resolve(__dirname, '.', 'target')
console.log(UPLOAD_DIR)
const filename = 'practice'
const filePath = path.resolve(UPLOAD_DIR, '..', `${filename}`)
const mergeFileChunk = async (filepath, filename, size) => {

}
// mergeFileChunk(filePath, filename, 1*1024*1024)