import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    coverage: {
      include: [
        'src/heenari/auth/access.ts',
        'src/heenari/AppShell.tsx',
        'src/heenari/Login.tsx',
        'src/heenari/pages.tsx',
        'src/heenari/reservations/policy.ts',
        'src/heenari/reservations/slots.ts',
        'src/heenari/reservations/messages.ts',
        'src/heenari/reservations/repository.ts',
        'src/heenari/reservations/useMyUpcomingReservations.ts',
        'src/heenari/reservations/useOnlineStatus.ts',
        'src/heenari/reservations/ReservationList.tsx',
        'src/heenari/reservations/calendar.ts',
        'src/heenari/admin/adminAccess.ts',
        'src/heenari/schedule/eventPolicy.ts',
        'src/heenari/schedule/timeline.ts',
        'src/heenari/schedule/eventRepository.ts',
        'src/heenari/schedule/useScheduleData.ts',
        'src/heenari/schedule/ScheduleCalendar.tsx',
        'src/heenari/schedule/ScheduleTimeline.tsx',
        'src/heenari/schedule/ScheduleBoard.tsx',
        'src/heenari/schedule/entry.ts',
        'src/heenari/schedule/EntrySheet.tsx',
      ],
      exclude: ['src/heenari/**/*.test.{ts,tsx}'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
