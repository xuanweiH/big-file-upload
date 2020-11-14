import Vue from 'vue'
import App from './App.vue'
import elementUI from 'element-ui'
Vue.config.productionTip = false
Vue.use(elementUI)
new Vue({
  render: h => h(App),
}).$mount('#app')
