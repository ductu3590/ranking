import MobileBottomNav from '@/components/MobileBottomNav';

export default function QuyLayout({ children }) {
    return (
        <>
            {children}
            <MobileBottomNav area="fund" />
        </>
    );
}
