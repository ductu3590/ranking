import MobileBottomNav from '@/components/MobileBottomNav';

export default function GiaiDauLayout({ children }) {
    return (
        <>
            {children}
            <MobileBottomNav area="tournament" />
        </>
    );
}
