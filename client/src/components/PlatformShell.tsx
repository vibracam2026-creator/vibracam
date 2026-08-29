import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useSound } from "@/contexts/SoundContext";
import { BrandLogo } from "@/components/BrandLogo";
import { useLanguage } from "@/lib/i18n";
import {
  Bell,
  Clapperboard,
  Compass,
  Hash,
  House,
  Laptop,
  LogOut,
  Menu,
  MessageCircle,
  Mic,
  Radio,
  Settings,
  ShoppingBag,
  UserPlus,
  UserRound,
  Video,
  PhoneCall,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { appSocket } from "@/lib/socket";

export function PlatformShell({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useLanguage();
  const { user, isAuthenticated, logout } = useAuth();
  const {
    enabled: soundEnabled,
    toggleSound,
    play,
  } = useSound();

  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  const utils = trpc.useUtils();

  const notifications = trpc.notifications.list.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 120_000,
  });

  const unread =
    notifications.data?.filter(
      (item) => !item.notification.isRead,
    ).length ?? 0;

  const previousUnread = useRef(unread);

  /*
   * Socket.IO مشترك بين جميع صفحات التطبيق.
   *
   * مهم:
   * لا ننشئ اتصال Socket جديد هنا.
   * ولا نستخدم appSocket.close() عند مغادرة الصفحة.
   */
  useEffect(() => {
    if (!isAuthenticated) return;

    const refresh = () => {
      void utils.notifications.list.invalidate();
    };

    appSocket.on("notification:new", refresh);

    return () => {
      /*
       * نحذف مستمع هذه الصفحة فقط.
       * الاتصال نفسه يبقى مفتوحًا لبقية التطبيق.
       */
      appSocket.off("notification:new", refresh);
    };
  }, [isAuthenticated, utils]);

  /*
   * تشغيل صوت عند وصول إشعار جديد.
   */
  useEffect(() => {
    if (
      unread > previousUnread.current &&
      previousUnread.current >= 0
    ) {
      play("notification");
    }

    previousUnread.current = unread;
  }, [unread, play]);

  /*
   * تسجيل الخروج.
   */
  const exit = async () => {
    await logout();
    setLocation("/");
  };

  /*
   * الروابط الرئيسية.
   */
  const mainLinks = [
    {
      href: "/feed",
      label: t("home"),
      icon: House,
    },
    {
      href: "/discover",
      label: t("discover"),
      icon: Compass,
    },
    {
      href: "/messages",
      label: t("messages"),
      icon: MessageCircle,
    },
    {
      href: "/groups",
      label: t("groups"),
      icon: Users,
    },
    {
      href: "/stories",
      label: t("createPost"),
      icon: Clapperboard,
    },
    {
      href: "/reels",
      label: t("reels"),
      icon: Video,
    },
  ];

  /*
   * روابط القائمة الإضافية.
   */
  const moreLinks = [
    ...(user?.role === "admin"
      ? [
          {
            href: "/admin",
            label: "الإدارة",
            icon: Settings,
          },
        ]
      : []),

    {
      href: "/marketplace",
      label: t("marketplace"),
      icon: ShoppingBag,
    },

    {
      href: "/live",
      label: t("live"),
      icon: Radio,
    },

    {
      href: "/spaces",
      label: t("spaces"),
      icon: Mic,
    },

    {
      href: "/channels",
      label: t("channels"),
      icon: Hash,
    },

    {
      href: "/friend-requests",
      label: t("طلبات الصداقة"),
      icon: UserPlus,
    },

    {
      href: "/random-call",
      label: t("randomCall"),
      icon: PhoneCall,
    },
  ];

  return (
    <div
      className="page-shell vibra-bg"
      dir={lang === "ar" ? "rtl" : "ltr"}
    >
      {/* =========================
          رأس الشريط
      ========================== */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#160a26]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-3 sm:px-6">

          {/* =========================
              الشعار الرسمي
          ========================== */}
          <Link
            href="/"
            aria-label="VibraCam"
            className="flex shrink-0 items-center justify-center"
          >
            <BrandLogo className="h-12 w-12 sm:h-14 sm:w-14" />
          </Link>

          {/* =========================
              شريط التنقل للشاشات الكبيرة
          ========================== */}
          <nav className="hidden min-w-0 items-center gap-0.5 xl:flex">
            {mainLinks.map(
              ({ href, label, icon: Icon }) => (
                <NavLink
                  key={href}
                  href={href}
                  label={label}
                  icon={<Icon size={16} />}
                />
              ),
            )}
          </nav>

          {/* =========================
              أزرار الحساب
          ========================== */}
          <div className="flex items-center gap-1.5 sm:gap-2">

            {/* الصوت */}
            <button
              className="hidden h-9 w-9 place-items-center rounded-xl soft-button lg:grid lg:h-10 lg:w-10"
              aria-label={
                soundEnabled
                  ? t("mute")
                  : t("unmute")
              }
              aria-pressed={soundEnabled}
              title={
                soundEnabled
                  ? t("mute")
                  : t("unmute")
              }
              data-sound="toggle"
              onClick={toggleSound}
            >
              {soundEnabled ? (
                <Volume2 size={17} />
              ) : (
                <VolumeX size={17} />
              )}
            </button>

            {isAuthenticated ? (
              <>
                {/* =========================
                    الإشعارات
                ========================== */}
                <button
                  className="relative grid h-9 w-9 place-items-center rounded-xl soft-button sm:h-10 sm:w-10"
                  aria-label={t("notifications")}
                  onClick={() =>
                    setLocation("/notifications")
                  }
                >
                  <Bell size={17} />

                  {unread > 0 && (
                    <span className="notification-badge absolute -left-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-pink-500 px-1 text-[10px]">
                      {unread > 99
                        ? "99+"
                        : unread}
                    </span>
                  )}
                </button>

                {/* =========================
                    الملف الشخصي
                ========================== */}
                <button
                  className="hidden h-9 items-center gap-2 rounded-xl px-2.5 soft-button xl:flex"
                  onClick={() =>
                    setLocation(
                      `/profile/${user?.id}`,
                    )
                  }
                >
                  <UserRound size={16} />

                  <span className="max-w-20 truncate text-xs sm:max-w-28 sm:text-sm">
                    {user?.name ||
                      t("profile")}
                  </span>
                </button>

                {/* =========================
                    مبدّل اللغة
                ========================== */}
                <button
                  className="hidden h-9 w-9 place-items-center rounded-xl soft-button text-xs font-bold lg:grid lg:h-10 lg:w-10"
                  aria-label={t("language")}
                  onClick={() =>
                    setLang(
                      lang === "ar"
                        ? "en"
                        : "ar",
                    )
                  }
                >
                  {lang === "ar"
                    ? "EN"
                    : "ع"}
                </button>

                {/* =========================
                    الإعدادات
                ========================== */}
                <button
                  className="hidden h-9 w-9 place-items-center rounded-xl soft-button lg:grid lg:h-10 lg:w-10"
                  aria-label={t("settings")}
                  title={t("settings")}
                  onClick={() =>
                    setLocation(
                      "/account-center",
                    )
                  }
                >
                  <Settings size={16} />
                </button>

                {/* =========================
                    الإدارة
                ========================== */}
                {user?.role === "admin" && (
                  <button
                    className="hidden h-9 w-9 place-items-center rounded-xl soft-button xl:grid"
                    aria-label="الإدارة"
                    title="الإدارة"
                    onClick={() =>
                      setLocation("/admin")
                    }
                  >
                    <Users size={16} />
                  </button>
                )}

                {/* =========================
                    الأجهزة والجلسات
                ========================== */}
                <button
                  className="hidden h-9 w-9 place-items-center rounded-xl soft-button lg:grid"
                  aria-label={t(
                    "الأجهزةوالجلسات",
                  )}
                  onClick={() =>
                    setLocation(
                      "/settings/sessions",
                    )
                  }
                >
                  <Laptop size={16} />
                </button>

                {/* =========================
                    تسجيل الخروج
                ========================== */}
                <button
                  className="hidden h-9 w-9 place-items-center rounded-xl soft-button xl:grid"
                  aria-label={t("logout")}
                  onClick={exit}
                >
                  <LogOut size={16} />
                </button>
              </>
            ) : (
              /* =========================
                 تسجيل الدخول
              ========================== */
              <button
                onClick={() =>
                  setLocation("/login")
                }
                className="rounded-xl px-3 py-2 text-sm font-bold gradient-button"
              >
                {t("login")}
              </button>
            )}

            {/* =========================
                زر القائمة للموبايل
            ========================== */}
            <button
              className="grid h-9 w-9 place-items-center rounded-xl soft-button xl:hidden"
              aria-label={t("القائمة")}
              onClick={() =>
                setOpen(
                  (value) => !value,
                )
              }
            >
              {open ? (
                <X size={19} />
              ) : (
                <Menu size={19} />
              )}
            </button>
          </div>
        </div>

        {/* =========================
            القائمة الجانبية للموبايل
        ========================== */}
        {open && (
          <div className="mobile-drawer-enter max-h-[70vh] overflow-y-auto border-t border-white/10 px-3 py-2 xl:hidden">

            <div className="grid gap-0.5">
              {mainLinks.map(
                ({
                  href,
                  label,
                  icon: Icon,
                }) => (
                  <NavLink
                    key={href}
                    href={href}
                    label={label}
                    icon={<Icon size={17} />}
                    onClick={() =>
                      setOpen(false)
                    }
                  />
                ),
              )}
            </div>

            <div className="my-1 border-t border-white/10" />

            <div className="grid grid-cols-2 gap-1">

              <NavLink
                href={`/profile/${user?.id}`}
                label={t("profile")}
                icon={
                  <UserRound size={17} />
                }
                onClick={() =>
                  setOpen(false)
                }
              />

              <NavLink
                href="/account-center"
                label={t("settings")}
                icon={
                  <Settings size={17} />
                }
                onClick={() =>
                  setOpen(false)
                }
              />

              <NavLink
                href="/notifications"
                label={t("notifications")}
                icon={
                  <Bell size={17} />
                }
                onClick={() =>
                  setOpen(false)
                }
              />

              <NavLink
                href="/settings/sessions"
                label={t(
                  "الأجهزةوالجلسات",
                )}
                icon={
                  <Laptop size={17} />
                }
                onClick={() =>
                  setOpen(false)
                }
              />
            </div>

            <div className="my-1 border-t border-white/10" />

            <div className="grid gap-0.5">
              {moreLinks.map(
                ({
                  href,
                  label,
                  icon: Icon,
                }) => (
                  <NavLink
                    key={href}
                    href={href}
                    label={label}
                    icon={
                      <Icon size={17} />
                    }
                    onClick={() =>
                      setOpen(false)
                    }
                  />
                ),
              )}
            </div>

            <div className="my-1 flex items-center justify-between border-t border-white/10 pt-2">

              {/* اللغة */}
              <button
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm soft-button"
                onClick={() => {
                  setLang(
                    lang === "ar"
                      ? "en"
                      : "ar",
                  );
                  setOpen(false);
                }}
              >
                <Globe size={16} />

                {t("language")}:{" "}
                {lang === "ar"
                  ? "English"
                  : "العربية"}
              </button>

              {/* تسجيل الخروج */}
              <button
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-pink-300"
                onClick={async () => {
                  await exit();
                  setOpen(false);
                }}
              >
                <LogOut size={16} />

                {t("logout")}
              </button>
            </div>
          </div>
        )}
      </header>

      {/* =========================
          شريط سفلي للموبايل
      ========================== */}
      <nav className="mobile-bottom-nav sticky bottom-0 z-40 flex items-center justify-around border-t border-white/10 bg-[#160a26]/90 px-1 py-1 backdrop-blur-xl md:hidden">
        {[
          {
            href: "/feed",
            icon: House,
          },
          {
            href: "/discover",
            icon: Compass,
          },
          {
            href: "/messages",
            icon: MessageCircle,
          },
          {
            href: "/reels",
            icon: Video,
          },
          {
            href: "/live",
            icon: Radio,
          },
        ].map(
          ({
            href,
            icon: Icon,
          }) => {
            const [currentLocation] =
              useLocation();

            const active =
              currentLocation === href ||
              (href !== "/feed" &&
                currentLocation.startsWith(
                  href,
                ));

            return (
              <Link
                key={href}
                href={href}
                className={`grid place-items-center rounded-lg px-3 py-1.5 ${
                  active
                    ? "bg-white/12 text-pink-200"
                    : "text-violet-100/70"
                }`}
              >
                <Icon size={19} />
              </Link>
            );
          },
        )}
      </nav>

      {/* =========================
          محتوى الصفحة
      ========================== */}
      <main
        key={location}
        className="route-enter mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6 pb-16 md:pb-6"
      >
        {children}
      </main>
    </div>
  );
}

/* =========================
   أيقونة اللغة
========================= */

function Globe({
  size,
}: {
  size: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
      />

      <path d="M2 12h20" />

      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

/* =========================
   رابط التنقل
========================= */

function NavLink({
  href,
  label,
  icon,
  onClick,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
}) {
  const [location] =
    useLocation();

  const active =
    location === href ||
    (href !== "/feed" &&
      location.startsWith(href));

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`inline-flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 text-sm transition ${
        active
          ? "bg-white/12 text-pink-200"
          : "text-violet-100/70 hover:bg-white/7 hover:text-white"
      }`}
    >
      {icon}

      <span className="truncate">
        {label}
      </span>
    </Link>
  );
}
