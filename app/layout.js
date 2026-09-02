import './globals.css'

export const metadata = {
    title: 'Pickhub',
    description: 'Cùng xây dựng cộng đồng Pickleball phát triển.',
    viewport: 'width=device-width, initial-scale=1, maximum-scale=5',
}

export default function RootLayout({ children }) {
    return (
        <html lang="vi">
            <body>{children}</body>
        </html>
    )
}
