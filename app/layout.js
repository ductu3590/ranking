import './globals.css'

export const metadata = {
    title: 'Quỹ CLB Pickleball 246',
    description: 'Hệ thống quản lý quỹ và sự kiện đóng quỹ CLB Pickleball 246',
    viewport: 'width=device-width, initial-scale=1, maximum-scale=5',
}

export default function RootLayout({ children }) {
    return (
        <html lang="vi">
            <body>{children}</body>
        </html>
    )
}
