import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Purchases, {
  LOG_LEVEL,
  CustomerInfo,
  PurchasesOfferings,
} from 'react-native-purchases';

import { useAuth } from '@/src/hooks/useAuth';

const API_KEY = 'test_GJwEnFombuxtBxXvZLXFFZAQjrK';
const ENTITLEMENT_ID = 'Tablink Premium';

interface SubscriptionContextValue {
  /** True while the initial customerInfo fetch is in-flight. */
  isLoading: boolean;
  /** Whether the user has an active "Tablink Premium" entitlement. */
  isPremium: boolean;
  /** Full customer info from RevenueCat. */
  customerInfo: CustomerInfo | null;
  /** Cached offerings (monthly/yearly products). */
  offerings: PurchasesOfferings | null;
  /** Restore previous purchases. */
  restorePurchases: () => Promise<void>;
  /** Re-fetch customer info (e.g. after a webhook-driven change). */
  refreshCustomerInfo: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

export function RevenueCatProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const configuredRef = useRef(false);

  // ── 1. Configure SDK once ──────────────────────────────────
  useEffect(() => {
    if (configuredRef.current) return;
    configuredRef.current = true;

    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
    }

    Purchases.configure({ apiKey: API_KEY });
  }, []);

  // ── 2. Identify / reset user on auth changes ──────────────
  useEffect(() => {
    if (!configuredRef.current) return;

    (async () => {
      try {
        if (user?.id) {
          const { customerInfo: info } = await Purchases.logIn(user.id);
          setCustomerInfo(info);
        } else {
          // Logged-out: switch to anonymous user
          const info = await Purchases.logOut();
          setCustomerInfo(info);
        }
      } catch (err) {
        console.warn('[RevenueCat] identify error:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user?.id]);

  // ── 3. Listen for real-time customerInfo updates ───────────
  useEffect(() => {
    const listener = (info: CustomerInfo) => {
      setCustomerInfo(info);
    };
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  // ── 4. Fetch offerings once identified ─────────────────────
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const o = await Purchases.getOfferings();
        setOfferings(o);
      } catch (err) {
        console.warn('[RevenueCat] offerings error:', err);
      }
    })();
  }, [user?.id]);

  // ── Derived state ──────────────────────────────────────────
  const isPremium = useMemo(() => {
    return typeof customerInfo?.entitlements.active[ENTITLEMENT_ID] !== 'undefined';
  }, [customerInfo]);

  // ── Actions ────────────────────────────────────────────────
  const restorePurchases = useCallback(async () => {
    try {
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
    } catch (err) {
      console.error('[RevenueCat] restore error:', err);
      throw err;
    }
  }, []);

  const refreshCustomerInfo = useCallback(async () => {
    try {
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
    } catch (err) {
      console.warn('[RevenueCat] refresh error:', err);
    }
  }, []);

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      isLoading,
      isPremium,
      customerInfo,
      offerings,
      restorePurchases,
      refreshCustomerInfo,
    }),
    [
      isLoading,
      isPremium,
      customerInfo,
      offerings,
      restorePurchases,
      refreshCustomerInfo,
    ]
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error('useSubscription must be used within a RevenueCatProvider');
  }
  return ctx;
}
