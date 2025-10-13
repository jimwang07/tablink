import { useState, useEffect } from 'react'
import Cookies from 'js-cookie'
import { supabase } from '@/libs/supabase'

export function useClaimerSession() {
    const [claimerName, setClaimerName] = useState<string | null>(null)
  
    useEffect(() => {
      // Load from cookies on mount
      const name = Cookies.get('claimerName')
      if (name) setClaimerName(name)
    }, [])
  
    const setName = async (name: string) => {
      Cookies.set('claimerName', name, { path: '/' })
      setClaimerName(name)
      // Upsert user into Supabase
      const { error } = await supabase
        .from('users')
        .upsert({ cashtag: name });
      if (error) {
        console.error('Failed to upsert user:', error);
      }
    }
  
    const clearSession = () => {
      Cookies.remove('claimerName', { path: '/' })
      setClaimerName(null)
    }
  
    return {
      claimerName,
      setName,
      clearSession,
      isLoggedIn: !!claimerName
    }
}
