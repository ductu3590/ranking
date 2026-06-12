import MobileBottomNav from '@/components/MobileBottomNav';
import HomeHeader from '@/components/HomeHeader';
import TournamentModuleNav from '@/components/TournamentModuleNav';

export default function GiaiDauLayout({ children }) {
    return (
        <>
            <HomeHeader />
            <TournamentModuleNav />
            {children}
            <MobileBottomNav />
        </>
    );
}
