import { Routes } from "../routes";

/**
 * website config, without translations
 *
 * docs:
 * https://mksaas.com/docs/config/website
 */
export const websiteConfig = {
  metadata: {
    title: '开镜',
    authorName: '开镜',
    icpNumber: '',
    gonganIcpNumber: '',
    description: '开镜是开源的 AI 短剧 / 漫剧制作工具。一期是桌面客户端加薄云控制面。',
    base_url: 'https://vercelai.cn',
    theme: {
      defaultTheme: 'default',
      enableSwitch: false,
    },

    mode: {
      defaultMode: 'system',
      enableSwitch: true,
    },
    images: {
      ogImage: '/images/opengraph.png',
      logoLight: '/logo.png',
      logoDark: '/logo-dark.png',
    },
    social: {
      wechatId: '',
      phoneNumber: '',
      email: 'hello@vercelai.cn',
      address: '',
      websiteUrl: 'https://vercelai.cn',
      github: '',
      twitter: '',
      blueSky: '',
      discord: '',
      mastodon: '',
      linkedin: '',
      youtube: '',
      telegram: '',
      tiktok: '',
      instagram: '',
      facebook: '',
    },
  },
  features: {
    enableDiscordWidget: false,
    enableUpgradeCard: false,
    enableAffonsoAffiliate: false,
  },
  routes: {
    defaultLoginRedirect: Routes.Console,
  },
  analytics: {
    enableVercelAnalytics: false,
    enableSpeedInsights: false,
  },
  auth: {
    emailSuffix: 'vercelai.cn',
    cookieDomain: process.env.NODE_ENV === 'production' ? '.vercelai.cn' : undefined,
    cookiePrefix: 'web',
    trustedOrigins:
      process.env.NODE_ENV === 'production'
        ? ['https://vercelai.cn', 'https://www.vercelai.cn']
        : undefined,
    allowPublicSignUp: false,
    allowPhoneSignUp: false,
    loginMethods: ['email', 'phone'] as const,
    requireProvisionedToLogin: true,
    enableGoogleLogin: false,
    enableGithubLogin: false,
    requireEmailVerification: false,
    autoSignInAfterVerification: true,
    smsProvider: (process.env.SMS_PROVIDER as 'tencent' | 'aliyun') || 'tencent', // 短信服务提供商: tencent 或 aliyun
  },
  i18n: {
    defaultLocale: 'zh',
    locales: {
      en: {
        flag: '🇺🇸',
        name: 'English',
      },
      zh: {
        flag: '🇨🇳',
        name: '中文',
      },
    },
  },
  blog: {
    paginationSize: 6,
    relatedPostsSize: 3,
  },
  mail: {
    provider: 'nodemailer' as const,
    fromEmail: 'GPURun Cloud <service@gpurun.cn>',
    supportEmail: 'GPURun Cloud <service@gpurun.cn>',
  },
  newsletter: {
    provider: 'nodemailer' as const,
    autoSubscribeAfterSignUp: true,
  },
  storage: {
    provider: 'oss',
  },
  payment: {
    provider: 'wechat',
  }
}
