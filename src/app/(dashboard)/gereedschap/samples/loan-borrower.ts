import { SampleLoan } from '@/lib/types'

export type LoanWithProject = SampleLoan & {
  project: { title: string; customer: { first_name: string; last_name: string } | null } | null
}

export const LOAN_SELECT = '*, project:finka_projects(title, customer:finka_customers(first_name, last_name))'

// Bij wie de staal ligt: de klant van het project (met projectnaam), anders
// de losse naam die bij het uitlenen is ingevuld.
export function loanBorrower(loan: LoanWithProject): string {
  if (loan.project) {
    const c = loan.project.customer
    return c ? `${c.first_name} ${c.last_name} · ${loan.project.title.trim()}` : loan.project.title.trim()
  }
  return loan.borrower_name || 'Onbekend'
}
