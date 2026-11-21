import type { Locale, Messages } from 'next-intl'

/** Used by React Email previews only; real sends use app `getMessagesForLocale`. */
export const previewDefaultLocale = 'en' as Locale

export const previewMessages = {
  Metadata: { name: '开镜' },
  Mail: {
    common: {
      team: 'The {name} team',
      copyright: '© {year} All rights reserved.',
    },
    verifyEmail: {
      subject: 'Verify your email',
      title: 'Hello {name}',
      body: 'Click the button below to verify your email address.',
      confirmEmail: 'Verify email',
    },
    forgotPassword: {
      subject: 'Reset your password',
      title: 'Hello {name}',
      body: 'We received a request to reset your password.',
      resetPassword: 'Reset password',
    },
    organizationInvitation: {
      subject: 'Organization invitation',
      title: 'Hello {name},',
      body: '{invitedByName} invited you to join {organizationName}.',
      passwordHint: 'Click the button below to accept and set your login password.',
      accept: 'Accept invitation',
      relogin: 'After setting your password, please sign in again.',
    },
    contactMessage: {
      subject: 'Contact message',
      name: 'Name: {name}',
      email: 'Email: {email}',
      message: 'Message: {message}',
    },
    subscribeNewsletter: {
      subject: 'Newsletter',
      body: 'You are subscribed to our newsletter.',
    },
    contractForSupplierConfirmation: {
      subject: 'New contract for confirmation - {contractNo}',
      title: 'Dear {supplierName},',
      body: 'A new cooperation agreement (Contract No.: {contractNo}) has been created. Please review and confirm.',
      capacitySummary: 'Capacity: {summary}',
      totalAmount: 'Amount: {amount}',
      viewAndConfirm: 'View & Confirm',
      footer: 'If you have any questions, please contact platform operations.',
    },
  },
} as unknown as Messages
