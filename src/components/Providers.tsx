"use client"

import { trpc } from '@/app/_trpc/client'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import { PropsWithChildren } from 'react'
import { httpBatchLink } from '@trpc/client'
import { useState } from 'react'
import { absoluteUrl } from '@/lib/utils'


export const Providers = ({children} : PropsWithChildren) =>{
    const [queryClient] = useState(() => new QueryClient())
    const [trpcClient] = useState(() => trpc.createClient({
        links:[
            httpBatchLink({
                url:  absoluteUrl('/api/trpc'),
            })
        ],
    }))

    
return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
        {children}
        </QueryClientProvider>
    </trpc.Provider>
)
}
