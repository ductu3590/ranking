import './globals.css'

export const metadata = {
    title: 'Quỹ Pickleball - Bảng Xếp Hạng',
    description: 'Theo dõi quỹ đóng góp và bảng xếp hạng thành viên Pickleball',
}

export default function RootLayout({ children }) {
    return (
        <html lang="vi">
            <body>{children}</body>
        </html>
    )
}
