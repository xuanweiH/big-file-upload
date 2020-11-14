const http = require("http");
const path = require("path")
const fse = require("fs-extra")
const mutiparty = require("mutiparty")

const server = http.createServer();
const UPLOAD_DIR = path.resolve(__dirname,"..","target") // 大文件存储目录

// 合并切片
// 在接收到前端发送的合并请求后, 服务端将文件夹下的所有切片进行合并
const resolvePost = req => {
    new Promise(resolve => {
        let chunk = "";
        res.on("data", data => {
            chunk += data
        })
        res.on("end", () => {
            resolve(JSON.parse(chunk))
        })
    })
}

const pipeStream = (path, writeStream) => {
    new Promise(resolve => {
        const readStream = fse.createReadStream(path)
        readStream.on("end", () => {
            fse.unlinkSync(path)
            resolve()
        })
        readStream.pipe(writeStream)
    })
}
// 合并切片
const mergeFileChunk = async (filePath, filename, size) => {
    const chunkDir = path.resolve(UPLOAD_DIR, filename)
    const chunkPaths = await fse.readdir(chunkDir)
    // 根据切片下标进行排序
    // 否则直接读取目录的获取顺序可能会发生错乱
    chunkPaths.sort((a,b) => a.split("-")[1] - b.split("-")[1])
    await Promise.all(
        chunkPaths.map((chunkPath, index) => 
           pipeStream(
               path.resolve(chunkDir, chunkPath),
               fse.createReadStream(filePath, {
                   start: index * size,
                   end: (index+1) * size 
               })
           )
        )
    )
    fse.rmdirSync(chunkDir) // 合并后删除保存切片的目录
}



server.on("request", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin","");
    res.setHeader("Access-Control-Allow-Headers","");
    if (req.method === 'OPTIONS') {
        res.status = 200;
        res.end();
        return;
    }
})

if (req.url === '/merge') {
    const data = await resolvePost(req)
    const {filename, size} = data
    const filePath =  path.resolve(UPLOAD_DIR, `${filename}`)
    await mergeFileChunk(filePath,filename)
    res.end(
        JSON.stringify({
            code:0,
            message: 'file merged success'
        })
    )
}

const multipart = new multipart.Form()

multipart.parse(req, async (err, fields, files) => {
    if(err) return
    const [chunk] = files.chunk;
    const [hash] = fields.hash;
    const [filename] = fields.filename
    const chunkDir = path.resolve(UPLOAD_DIR, filename)
    // 切片目录不存在, 创建切片目录
    if (!fse.existsSync(chunkDir)) {
        await fse.mkdirs(chunkDir)
    }

    // fs-extra 专用方法 类似于fs.rename 并且跨平台
    // fs-extra 的rename方法 windows平台会有权限问题
    // https: //
    // chunk 对象，path 是存储临时文件的路径，size 是临时文件大小，
    // 在 multiparty 文档中提到可以使用 fs.rename(由于我用的是 fs-extra，
    // 它的 rename 方法 windows 平台权限问题，所以换成了 fse.move) 移动临时文件，即移动文件切片
    await fse.move(chunk.path, `${chunkDir}/${hash}`)
    // 在接收文件切片时,需要先创建存储切片的文件夹, 由于前端在发送每个切片额外携带了唯一值hash
    // 所以hash作为文件名, 将切片从临时路径移动切片文件夹中,最后的结果就是 target -> 文件 -> 文件切片01+文件切片02+...
    res.end("received file chunk")
})





server.listen(3000,() => console.log('正在监听3000端口'));