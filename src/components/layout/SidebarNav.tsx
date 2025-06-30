
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DRAW_SCHEDULE } from '@/lib/lotoDraws.tsx';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <ScrollArea className="h-[calc(100vh-12rem)] px-2"> {/* Adjust height as needed */}
      <Accordion type="multiple" className="w-full">
        {DRAW_SCHEDULE.map((daySchedule) => (
          <AccordionItem value={daySchedule.day} key={daySchedule.day}>
            <AccordionTrigger className="px-2 py-3 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md transition-colors [&[data-state=open]>svg]:rotate-90">
              <div className="flex items-center gap-2">
                {daySchedule.icon && <daySchedule.icon className="h-4 w-4 text-sidebar-foreground group-hover:text-sidebar-accent-foreground" />}
                <span className="text-sidebar-foreground group-hover:text-sidebar-accent-foreground">{daySchedule.day}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-1">
              <ul className="space-y-1 pl-4 border-l border-sidebar-border ml-2">
                {daySchedule.draws.map((draw) => (
                  <li key={draw.slug}>
                    <Button
                      asChild
                      variant="ghost"
                      className={cn(
                        'w-full justify-start h-9 px-2 text-xs font-normal rounded-md',
                        'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                        pathname === `/draw/${draw.slug}` && 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                      )}
                    >
                      <Link href={`/draw/${draw.slug}`} className="flex items-center gap-2">
                        {draw.icon && <draw.icon className="h-3.5 w-3.5" />}
                        <span>{draw.time} - {draw.name}</span>
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </ScrollArea>
  );
}
