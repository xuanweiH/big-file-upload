<template>
  <div>
      <input type="file" @change="handleFileChange" />
      <el-button @click="handleUpload">上传</el-button>
  </div>
  <div>
      <!-- <div>计算文件 hash</div>
      <el-progress :percentage="hashPercentage"></el-progress>
      <div>总进度</div>
      <el-progress :percentage="fakeUploadPercentage"></el-progress> -->
    </div>
    <!-- <el-table :data="data">
      <el-table-column
        prop="hash"
        label="切片hash"
        align="center"
      ></el-table-column>
      <el-table-column label="大小(KB)" align="center" width="120">
        <template v-slot="{ row }">
          {{ row.size | transformByte }}
        </template>
      </el-table-column>
      <el-table-column label="进度" align="center">
        <template v-slot="{ row }">
          <el-progress
            :percentage="row.percentage"
            color="#909399"
          ></el-progress>
        </template>
      </el-table-column>
    </el-table> -->
</template>

<script>
const SIZE = 10 * 1024 * 1024
const Status = {
  wait: "wait",
  pause: "pause",
  uploading: "uploading"
};
import request from "../api"
export default {
  data: () => ({
    Status,
    container: {
      file: null,
      hash: "",
      worker: null
    },
    hashPercentage: 0,
    data: [],
    requestList: [],
    status: Status.wait,
    // 当暂停时会取消 xhr 导致进度条后退
    // 为了避免这种情况，需要定义一个假的进度条
    fakeUploadPercentage: 0
  }),
  filters: {
    transformByte(val) {
      return Number((val / 1024).toFixed(0));
    }
  },
  computed: {
    uploadDisabled() {
      return (
        !this.container.file ||
        [Status.pause, Status.uploading].includes(this.status)
      );
    },
      // 上传百分比的监听
      uploadPercentage() {
        if (!this.container.file || !this.data.length) return 0;
        const loaded = this.data
          .map(item => item.size * item.percentage)
          .reduce((acc, cur) => acc + cur);
        return parseInt((loaded / this.container.file.size).toFixed(2));
      }
  },
  // 大文件上传前端的核心是利用blob.prototype.slice方法 返回文件切片
  // 和数组的slice方法类型, 调用的slice方法可以返回原文件的某个切片
//   将预先设置好的切片最大数量将文件切分为一个个切片,然后借助http的可并发性,
//   同时上传多个切片, 这样从原本一个大文件,变成了同时传多个小的文件切片,可以大大减少
//   上传时间, 另外由于是并发 传到服务器的顺序可能会发生变化,所以还需要给
//   每个切片记录顺序
  watch: {
    uploadPercentage(now) {
      if (now > this.fakeUploadPercentage) {
        this.fakeUploadPercentage = now;
      }
    }
  },

// 前端逻辑
// 1. 上传控件
// 2. 发请求
// 3. 文件切片
// 4. 合并切片请求

  methods: {
    // 点击停止
    handlePause() {
      this.status = Status.pause;
      this.resetData();
    },
    // 重置数据
    resetData() {
      this.requestList.forEach(xhr => xhr?.abort());
      this.requestList = [];
      if (this.container.worker) {
        this.container.worker.onmessage = null;
      }
    },
    async handleResume() {
      this.status = Status.uploading;
      const { uploadedList } = await this.verifyUpload(
        this.container.file.name,
        this.container.hash
      );
      await this.uploadChunks(uploadedList);
    },
      // 生成文件切片
      createFileChunk(file, size = SIZE) {
        // 创建容器
         const fileChunkList = []
         let cur = 0
         while (cur < file.size) {
           // 切片 file.slice
             fileChunkList.push({ file: file.slice(cur, cur+size) });
             cur += size
         }
         return fileChunkList
      },
      // 生成文件hash
    // calculateHash(fileChunkList) {
    //   return new Promise(resolve => {
    //     this.container.worker = new Worker("/hash.js");
    //     this.container.worker.postMessage({ fileChunkList });
    //     this.container.worker.onmessage = e => {
    //       const { percentage, hash } = e.data;
    //       this.hashPercentage = percentage;
    //       if (hash) {
    //         resolve(hash);
    //       }
    //     };
    //   });
    // },
      handleFileChange(e) {
         const [file] = e.target.files;
         if(!file) return;
         Object.assign(this.$data, this.$options.data())
         this.container.file = file
      },
      // 上传切片
      async uploadChunks() {
        const requestList = this.data
        .map(({chunk, hash, index}) => {
            const formData = new FormData()
            formData.append("chunk", chunk)
            formData.append("hash", hash)
            formData.append("fileName",this.container.file.name)
            return {formData, index}
        })
        .map(async ({formData, index}) => {
            request({
             url: "http://localhost:3000",
             data: formData,
             onProgress: this.createProgressHandler(this.data[index])
            })
        })
        await Promise.all(requestList)
        // 合并切片
        await this.mergeRequest()
      },
      // 合并切片请求

      // 接着使用 fs.createWriteStream 创建一个可写流，可写流文件名就是切片文件夹名 + 后缀名组合而成
      // 随后遍历整个切片文件夹，将切片通过 fs.createReadStream 创建可读流，传输合并到目标文件中
      // 值得注意的是每次可读流都会传输到可写流的指定位置，
      // 这是通过 createWriteStream 的第二个参数 start/end 控制的，目的是能够并发合并多个可读流到可写流中，
      // 这样即使流的顺序不同也能传输到正确的位置，所以这里还需要让前端在请求的时候多提供一个 size 参数
      async mergeRequest () {
         await request({
           url: "http://localhost:3000/merge",
           headers: {
             "content-type": "application/json"
           },
           data: JSON.stringify({
             size: SIZE,
             filename: this.container.file.name
           })
         })
      },
      async handleUpload() {
         if (!this.container.file) return
         const fileChunkList = this.createFileChunk(this.container.file)
         this.data = fileChunkList.map(({file}, index) => ({
           chunk: file,
           index,
           precentage: 0,
           hash: this.container.file.name + "-" + index // 文件名+下标 
         }));
         await this.uploadChunks()
      },
      createProgressHandler(item) {
        return e => {
          item.precentage = parseInt(String((e.loaded/e.total)*100))
        }
      }
  }
}
</script>

<style>

</style>