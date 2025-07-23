import { useState, useEffect } from 'react'
import Cookies from 'js-cookie'

export function useClaimerSession() {
    const [claimerName, setClaimerName] = useState<string | null>(null)
  
    useEffect(() => {
      // Load from cookies on mount
      const name = Cookies.get('claimerName')
      if (name) setClaimerName(name)
    }, [])
  
    const setName = (name: string) => {
      Cookies.set('claimerName', name, { path: '/' })
      setClaimerName(name)
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
