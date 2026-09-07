import './globals.css'

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
        <html lang="vi">
            <body>{children}</body>
        </html>
    )
}
