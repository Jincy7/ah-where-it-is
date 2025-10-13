"use client";

import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon, Search, X, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

export interface ItemFiltersProps {
  searchQuery: string;
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  onSearchChange: (value: string) => void;
  onDateFromChange: (date: Date | undefined) => void;
  onDateToChange: (date: Date | undefined) => void;
  onClearFilters: () => void;
  activeFilterCount: number;
}

export function ItemFilters({
  searchQuery,
  dateFrom,
  dateTo,
  onSearchChange,
  onDateFromChange,
  onDateToChange,
  onClearFilters,
  activeFilterCount,
}: ItemFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="space-y-4">
      {/* Mobile: Collapsible header */}
      <div className="flex items-center justify-between lg:hidden">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">필터</h3>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="h-5">
              {activeFilterCount}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-8 w-8 p-0"
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Filters content */}
      <div
        className={cn(
          "space-y-4 lg:space-y-0 lg:flex lg:items-center lg:gap-4",
          !isExpanded && "hidden lg:flex"
        )}
      >
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="물품명 또는 설명으로 검색..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onSearchChange("")}
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Date From Picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal lg:w-[200px]",
                !dateFrom && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateFrom ? (
                format(dateFrom, "PPP", { locale: ko })
              ) : (
                <span>시작일</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateFrom}
              onSelect={onDateFromChange}
              initialFocus
              disabled={(date) => {
                // Disable dates after dateTo if dateTo is set
                if (dateTo) {
                  return date > dateTo;
                }
                // Disable future dates
                return date > new Date();
              }}
            />
          </PopoverContent>
        </Popover>

        {/* Date To Picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal lg:w-[200px]",
                !dateTo && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateTo ? (
                format(dateTo, "PPP", { locale: ko })
              ) : (
                <span>종료일</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateTo}
              onSelect={onDateToChange}
              initialFocus
              disabled={(date) => {
                // Disable dates before dateFrom if dateFrom is set
                if (dateFrom) {
                  return date < dateFrom;
                }
                // Disable future dates
                return date > new Date();
              }}
            />
          </PopoverContent>
        </Popover>

        {/* Clear Filters Button */}
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            onClick={onClearFilters}
            className="w-full lg:w-auto"
          >
            <X className="mr-2 h-4 w-4" />
            초기화
            <Badge variant="secondary" className="ml-2 h-5">
              {activeFilterCount}
            </Badge>
          </Button>
        )}
      </div>
    </div>
  );
}
