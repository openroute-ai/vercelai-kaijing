import EmailButton from '../components/email-button'
import EmailLayout from '../components/email-layout'
import { previewDefaultLocale, previewMessages } from '../preview-messages'
import type { BaseEmailProps } from '../types'
import { Text } from '@react-email/components'
import { createTranslator } from 'use-intl/core'

interface ContractForSupplierConfirmationProps extends BaseEmailProps {
  supplierName: string
  contractNo: string
  contractUrl: string
  capacitySummary: string
  totalAmount?: string
}

export function ContractForSupplierConfirmation({
  supplierName,
  contractNo,
  contractUrl,
  capacitySummary,
  totalAmount,
  locale,
  messages,
}: ContractForSupplierConfirmationProps) {
  const t = createTranslator({
    locale,
    messages,
    namespace: 'Mail.contractForSupplierConfirmation',
  })

  return (
    <EmailLayout locale={locale} messages={messages}>
      <Text>{t('title', { supplierName })}</Text>
      <Text>{t('body', { contractNo })}</Text>
      <Text>{t('capacitySummary', { summary: capacitySummary })}</Text>
      {totalAmount && <Text>{t('totalAmount', { amount: totalAmount })}</Text>}
      <EmailButton href={contractUrl}>{t('viewAndConfirm')}</EmailButton>
      <Text>{t('footer')}</Text>
    </EmailLayout>
  )
}

ContractForSupplierConfirmation.PreviewProps = {
  locale: previewDefaultLocale,
  messages: previewMessages,
  supplierName: '示例供应商',
  contractNo: 'SC202607260001',
  contractUrl: 'https://vercelai.cn/console/contracts/test',
  capacitySummary: '2 个机房，共 10 台设备，32 张 H100',
  totalAmount: '¥120,000/月',
}

export default ContractForSupplierConfirmation
