/** 开镜本机工作台。画布运行时来自上游，产品名只用开镜。 */
export const appConfig = {
  app_url: 'http://127.0.0.1:3020',
  app_name: '开镜',
  app_description: '开源、本地优先的 AI 短剧与图像视频创作画布。',
  app_logo: '/logo.png',
  database_url: 'file:data/local.db',
} as const;
