/** 开镜积分占位规则。真实计价接通生成网关后再调整。 */
export const WELCOME_CREDIT_AMOUNT = "80.0000"

export const WELCOME_CREDIT_NOTE =
  "新用户礼包（占位额度）：大约够完成第一集的文本步骤，或生成第一镜视频。实际扣费将在生成接通后按供应商计价。"

export const WELCOME_GRANT_MARKER = "welcome-grant-v1"

export const CREDIT_COSTS = {
  text: "5.0000",
  image: "10.0000",
  video: "40.0000",
  audio: "8.0000",
} as const

export const PLACEHOLDER_CREDIT_COSTS = {
  text: CREDIT_COSTS.text,
  episodeText: "20.0000",
  characterImage: CREDIT_COSTS.image,
  shotVideo: CREDIT_COSTS.video,
  dialogueAudio: CREDIT_COSTS.audio,
} as const

export const PLACEHOLDER_CREDIT_PLANS = [
  {
    id: "starter",
    name: "体验包",
    credits: "80.0000",
    priceLabel: "待定价",
    description: "大约再做一镜或再走一遍文本步骤。支付通道尚未开通。",
  },
  {
    id: "creator",
    name: "创作包",
    credits: "500.0000",
    priceLabel: "待定价",
    description: "给连续创作预留的占位套餐。支付通道尚未开通。",
  },
  {
    id: "monthly",
    name: "月度套餐",
    credits: "800.0000",
    priceLabel: "待定价 / 月",
    description: "按月续订的占位套餐。支付通道尚未开通。",
  },
] as const
