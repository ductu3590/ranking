import { Montserrat } from 'next/font/google'
import './globals.css'

const montserrat = Montserrat({
    subsets: ['latin', 'vietnamese'],
    weight: ['400', '500', '600', '700', '800'],
    display: 'swap',
    variable: '--ph-font-loaded',
})

export const metadata = {
    title: 'Pickhub',
    description: 'Cùng xây dựng cộng đồng Pickleball phát triển.',
}

// Next 14 yêu cầu viewport tách riêng khỏi metadata.
export const viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
}

export default function RootLayout({ children }) {
    return (
        <html lang="vi" className={montserrat.variable}>
            <body style={{ fontFamily: 'var(--ph-font-loaded), var(--ph-font)' }}>{children}</body>
        </html>
    )
}
