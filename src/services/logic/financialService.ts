import { Payslip } from '../../types';

export function generatePaychecks(
    lastPayDateStr: string,
    currentDateStr: string,
    annualSalary: number
): { newPayslips: Payslip[], newLastPayDate: string, totalNetPay: number } {
    const lastPayDate = new Date(lastPayDateStr);
    const currentDate = new Date(currentDateStr);
    
    let newPayslips: Payslip[] = [];
    let totalNetPay = 0;
    let currentPayDate = new Date(lastPayDate);
    
    // Find the next payday after lastPayDate
    const getNextPayday = (date: Date) => {
        const d = new Date(date);
        if (d.getDate() < 15) {
            d.setDate(15);
        } else {
            d.setMonth(d.getMonth() + 1);
            d.setDate(1);
        }
        return d;
    };

    let nextPayday = getNextPayday(currentPayDate);

    while (nextPayday <= currentDate) {
        // Calculate days paid
        const daysPaid = Math.round((nextPayday.getTime() - currentPayDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // Annual salary / 365 * daysPaid
        const grossPay = (annualSalary / 365) * daysPaid;
        
        // Tax rates
        const federalTaxRate = 0.37;
        const stateTaxRate = 0.109;
        const cityTaxRate = 0.03876;
        
        const federalTax = grossPay * federalTaxRate;
        const stateTax = grossPay * stateTaxRate;
        const cityTax = grossPay * cityTaxRate;
        const netPay = grossPay - federalTax - stateTax - cityTax;
        
        const payslip: Payslip = {
            id: `payslip-${nextPayday.getTime()}`,
            date: nextPayday.toISOString(),
            payPeriod: `${currentPayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${nextPayday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
            grossPay,
            federalTax,
            stateTax,
            cityTax,
            netPay,
            daysPaid
        };
        
        newPayslips.push(payslip);
        totalNetPay += netPay;
        
        currentPayDate = new Date(nextPayday);
        nextPayday = getNextPayday(currentPayDate);
    }

    return {
        newPayslips,
        newLastPayDate: currentPayDate.toISOString(),
        totalNetPay
    };
}
