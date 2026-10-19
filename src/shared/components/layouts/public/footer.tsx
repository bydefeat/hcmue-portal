import Image from "next/image";
import { currentYear } from "@/shared/libs/date.lib";
import { Layout } from "antd";
import { Envelope, House, Phone, Print } from "defeat-icons-react";

const LEFT_LINKS = [
  { label: "Trang chủ", href: "https://hcmue.edu.vn/vi/" },
  { label: "Trang Facebook", href: "https://www.facebook.com/HCMUE.VN/" },
];

const RIGHT_LINKS = [
  { label: "Sự kiện", href: "https://hcmue.edu.vn/vi/tin-tuc-su-kien/su-kien" },
  { label: "Giới thiệu", href: "https://hcmue.edu.vn/vi/gioi-thieu/lich-su-phat-trien" },
];

const CAMPUSES = [
  "Cơ sở 2: 222 Lê Văn Sỹ, Phường Nhiêu Lộc, Thành phố Hồ Chí Minh",
  "Phân hiệu Long An: Số 934 Quốc lộ 1A, Phường Khánh Hậu, Tỉnh Tây Ninh",
];

const CONTACTS = [
  { icon: Envelope, label: "Email", value: "phongctct@hcmue.edu.vn", href: "mailto:phongctct@hcmue.edu.vn" },
  { icon: Phone, label: "Hotline", value: "028 - 38352020", href: "tel:02838352020" },
  { icon: Print, label: "Fax", value: "028 - 38398946" },
];

function FooterLinks({ links, className }: { links: typeof LEFT_LINKS; className: string }) {
  return (
    <nav className={`flex flex-col gap-2 md:flex-row md:gap-x-10 lg:gap-x-24 ${className}`}>
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium whitespace-nowrap text-primary-tint transition-colors hover:text-white"
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}

export function PublicFooter() {
  return (
    <Layout.Footer className="relative mt-20 text-white">
      <Image
        src="/hcmue-logo.png"
        alt="Logo Trường Đại học Sư phạm TP.HCM"
        width={2994}
        height={1512}
        className="absolute -top-10 left-1/2 h-[93px] w-auto -translate-x-1/2"
      />
      <div className="mx-auto w-full max-w-6xl px-4 pt-16 pb-28 sm:px-6 md:pb-6">
        <div className="grid grid-cols-2 items-center gap-4 border-b border-primary-tint/16 pb-4 md:grid-cols-[1fr_auto_1fr]">
          <FooterLinks links={LEFT_LINKS} className="items-start justify-start" />
          <p className="order-last col-span-2 text-center text-xs text-primary-tint md:order-none md:col-span-1">
            Bản quyền © {currentYear()} Trường Đại học Sư phạm Thành phố Hồ Chí Minh
          </p>
          <FooterLinks links={RIGHT_LINKS} className="items-end justify-end" />
        </div>

        <div className="grid gap-8 py-6 text-sm md:grid-cols-2">
          <div>
            <p className="flex items-center gap-2 font-medium">
              <House size={18} aria-hidden />
              Địa chỉ
            </p>
            <p className="mt-2 text-pretty">
              <span className="font-medium">Trụ sở chính</span>: 280 An Dương Vương, Phường Chợ Quán, Thành phố Hồ Chí Minh
            </p>
            <p className="mt-1 font-medium">Các cơ sở đào tạo khác:</p>
            <ul className="flex flex-col gap-0.5">
              {CAMPUSES.map((campus) => (
                <li key={campus} className="text-pretty">
                  • {campus}
                </li>
              ))}
            </ul>
          </div>
          <ul className="flex flex-col gap-2">
            {CONTACTS.map(({ icon: Icon, label, value, href }) => (
              <li key={label} className="flex items-center gap-3">
                <Icon size={18} aria-hidden className="shrink-0" />
                <span>
                  {label}:{" "}
                  {href ? (
                    <a href={href} className="text-white hover:underline">
                      {value}
                    </a>
                  ) : (
                    value
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Layout.Footer>
  );
}
