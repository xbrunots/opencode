"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../dropdown-menu/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../../sidebar/components/sidebar";
import type { SidebarUserMenuProps } from "../types/app-sidebar";

/** The account row at the bottom of the sidebar with its menu. */
export function SidebarUserMenu({
  name,
  email,
  avatarSrc,
  children,
}: SidebarUserMenuProps) {
  const { isMobile, state } = useSidebar();
  let side: "bottom" | "right" | "top" = "top";
  if (isMobile) {
    side = "bottom";
  } else if (state === "collapsed") {
    side = "right";
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                tooltip={name}
                className="data-popup-open:bg-sidebar-accent/90 data-popup-open:text-sidebar-accent-foreground data-popup-open:ring-sidebar-border/70 min-w-0 cursor-pointer group-data-[collapsible=icon]:bg-transparent! group-data-[collapsible=icon]:ring-0! data-popup-open:ring-1"
              />
            }
          >
            <Avatar className="size-8 shrink-0 rounded-lg transition-opacity group-data-[collapsible=icon]:group-hover/menu-button:opacity-80 after:rounded-lg">
              {avatarSrc ? (
                <AvatarImage className="rounded-lg" src={avatarSrc} alt="" />
              ) : null}
              <AvatarFallback className="bg-sidebar-accent rounded-lg">
                {name.trim().charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
              {name}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-64"
            side={side}
            sideOffset={6}
          >
            <div className="grid gap-0.5 px-2 py-1.5">
              <span className="truncate text-sm font-medium">{name}</span>
              {email ? (
                <span className="text-muted-foreground truncate text-xs">
                  {email}
                </span>
              ) : null}
            </div>
            <DropdownMenuSeparator />
            {children}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
