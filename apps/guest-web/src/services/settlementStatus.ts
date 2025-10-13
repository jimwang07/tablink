import { supabase } from '@/libs/supabase';
import { Receipt, ReceiptItem, ItemClaim } from '@/types/supabase';

export interface SettlementStatus {
  totalAmount: number;
  settledAmount: number;
  claimedAmount: number;
  availableAmount: number;
  settlementPercentage: number;
  isFullySettled: boolean;
}

export interface ReceiptWithSettlement extends Receipt {
  settlement: SettlementStatus;
}

export const settlementService = {
  async calculateSettlementStatus(receipt: Receipt): Promise<SettlementStatus> {
    try {
      // Get receipt items
      const { data: items, error: itemsError } = await supabase
        .from('receipt_items')
        .select('*')
        .eq('receipt_id', receipt.id);

      if (itemsError) {
        throw new Error(`Failed to fetch receipt items: ${itemsError.message}`);
      }

      if (!items || items.length === 0) {
        return {
          totalAmount: receipt.total,
          settledAmount: 0,
          claimedAmount: 0,
          availableAmount: receipt.total,
          settlementPercentage: 0,
          isFullySettled: false
        };
      }

      // Get all claims for these items
      const itemIds = items.map(item => item.id);
      const { data: claims, error: claimsError } = await supabase
        .from('item_claims')
        .select('*')
        .in('item_id', itemIds);

      if (claimsError) {
        throw new Error(`Failed to fetch claims: ${claimsError.message}`);
      }

      // Calculate settlement status with proper tax/tip distribution
      const receiptSubtotal = receipt.subtotal || 0;
      const receiptTax = receipt.tax || 0;
      const receiptTip = receipt.tip || 0;
      
      let settledAmount = 0;
      let claimedAmount = 0;
      let availableAmount = 0;

      items.forEach(item => {
        const itemSubtotal = item.price * item.quantity;
        
        // Calculate this item's share of tax and tip based on its proportion of the subtotal
        let itemTotalWithTaxTip = itemSubtotal;
        if (receiptSubtotal > 0) {
          const itemProportion = itemSubtotal / receiptSubtotal;
          const itemTax = receiptTax * itemProportion;
          const itemTip = receiptTip * itemProportion;
          itemTotalWithTaxTip = itemSubtotal + itemTax + itemTip;
        }
        const itemClaims = (claims || []).filter(c => c.item_id === item.id);

        if (itemClaims.length === 0) {
          // No claims - fully available
          availableAmount += itemTotalWithTaxTip;
        } else {
          // Has claims - calculate settled vs claimed portions
          const paidPortion = itemClaims
            .filter(claim => claim.payment_status === 'paid')
            .reduce((sum, claim) => sum + (claim.portion || 0), 0);

          const totalClaimedPortion = itemClaims
            .reduce((sum, claim) => sum + (claim.portion || 0), 0);

          const unclaimedPortion = Math.max(0, item.quantity - totalClaimedPortion);
          const pendingPortion = Math.max(0, totalClaimedPortion - paidPortion);

          // Calculate actual amounts with tax and tip distributed proportionally
          const paidPortionWithTaxTip = (paidPortion * itemTotalWithTaxTip) / item.quantity;
          const claimedPortionWithTaxTip = (pendingPortion * itemTotalWithTaxTip) / item.quantity;
          const unclaimedPortionWithTaxTip = (unclaimedPortion * itemTotalWithTaxTip) / item.quantity;

          settledAmount += paidPortionWithTaxTip;
          claimedAmount += claimedPortionWithTaxTip; // claimed but not paid
          availableAmount += unclaimedPortionWithTaxTip;
        }
      });

      const settlementPercentage = receipt.total > 0 ? (settledAmount / receipt.total) * 100 : 0;
      const isFullySettled = settlementPercentage >= 99.99; // Account for floating point precision

      return {
        totalAmount: receipt.total,
        settledAmount,
        claimedAmount,
        availableAmount,
        settlementPercentage,
        isFullySettled
      };
    } catch (error) {
      console.error('Error calculating settlement status:', error);
      return {
        totalAmount: receipt.total,
        settledAmount: 0,
        claimedAmount: 0,
        availableAmount: receipt.total,
        settlementPercentage: 0,
        isFullySettled: false
      };
    }
  },

  async getReceiptsWithSettlement(receipts: Receipt[]): Promise<ReceiptWithSettlement[]> {
    const receiptsWithSettlement: ReceiptWithSettlement[] = [];
    
    for (const receipt of receipts) {
      const settlement = await this.calculateSettlementStatus(receipt);
      receiptsWithSettlement.push({
        ...receipt,
        settlement
      });
    }
    
    return receiptsWithSettlement;
  }
};