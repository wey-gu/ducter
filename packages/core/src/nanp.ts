// D208: the time zone of a North American number from its area code, so a +1 number is checked
// against the callee's own clock instead of every continental US zone at once (which held a
// Washington, DC number until noon Eastern). Area codes that span two zones list both (the stricter
// window wins); an area code not here (toll-free, a new overlay, the territories) falls back to the
// four continental zones. Sources: NANPA's area code map and the state time zone lines (DOCUMENTED,
// read from memory of NANPA's public lists; a code added after 2025 may be missing and only falls
// back, never errs).

const BY_ZONE: Record<string, string> = {
  "America/New_York":
    // CT DE DC GA ME MD MA NH NJ NY NC OH PA RI SC VT VA WV, most of FL MI IN KY TN
    "203 475 860 959 302 202 771 229 404 470 478 678 706 762 770 912 943 207 227 240 301 410 443 667 339 351 413 508 617 774 781 857 978 603 " +
    "201 551 609 640 732 848 856 862 908 973 212 315 332 347 363 516 518 585 607 631 646 680 716 718 838 845 914 917 929 934 " +
    "252 336 472 704 743 828 910 919 980 984 216 220 234 283 326 330 380 419 436 440 513 567 614 740 937 " +
    "215 223 267 272 412 445 484 570 582 610 717 724 814 835 878 401 803 821 839 843 854 864 802 276 434 540 571 686 703 757 804 826 948 304 681 " +
    "239 305 321 324 352 386 407 448 561 645 656 689 727 728 754 772 786 813 863 904 941 954 " +
    "231 248 269 313 517 586 616 679 734 810 947 989 260 317 463 574 765 502 606 859 423 865",
  "America/Chicago":
    // AL AR IL IA LA MN MS MO OK WI, most of KS NE ND SD TX, west KY and TN, the FL panhandle, north-west IN
    "205 251 256 334 659 938 327 479 501 870 217 224 309 312 331 447 464 618 630 708 730 773 779 815 847 861 872 " +
    "319 515 563 641 712 225 318 337 504 985 218 320 507 612 651 763 952 228 601 662 769 314 417 557 573 636 660 816 975 " +
    "405 539 572 580 918 262 274 353 414 534 608 715 920 316 620 913 402 531 701 " +
    "210 214 254 281 325 346 361 409 430 432 469 512 682 713 726 737 806 817 830 832 903 936 940 945 956 972 979 " +
    "270 364 615 629 731 901 931 219",
  "America/Denver": "303 719 720 970 983 406 505 575 385 435 801 307 915",
  "America/Phoenix": "480 520 602 623 928",
  "America/Los_Angeles":
    "209 213 279 310 323 341 350 369 408 415 424 442 510 530 559 562 619 626 628 650 657 661 669 707 714 747 760 805 818 820 831 840 858 909 916 925 949 951 " +
    "702 725 775 458 503 541 971 206 253 360 425 509 564",
  "America/Anchorage": "907",
  "Pacific/Honolulu": "808",
  // Canada
  "America/Toronto": "226 249 289 343 365 382 416 437 519 548 613 647 683 705 742 753 905 942 263 354 367 418 438 450 468 514 579 581 819 873",
  "America/Winnipeg": "204 431 584",
  "America/Regina": "306 474 639",
  "America/Edmonton": "368 403 587 780 825",
  "America/Vancouver": "236 250 257 604 672 778",
  "America/Halifax": "782 902 428 506",
  "America/St_Johns": "709",
  // US territories
  "America/Puerto_Rico": "787 939 340",
  "Pacific/Guam": "671 670",
};

/** Area codes that cross a zone line: both zones (the call must suit both). */
const SPLIT: Record<string, string[]> = {
  "850": ["America/New_York", "America/Chicago"], // FL panhandle
  "906": ["America/New_York", "America/Chicago"], // MI upper peninsula
  "812": ["America/New_York", "America/Chicago"], // southern IN
  "930": ["America/New_York", "America/Chicago"],
  "308": ["America/Chicago", "America/Denver"], // western NE
  "605": ["America/Chicago", "America/Denver"], // SD
  "785": ["America/Chicago", "America/Denver"], // north-west KS
  "208": ["America/Denver", "America/Los_Angeles"], // ID
  "986": ["America/Denver", "America/Los_Angeles"],
  "807": ["America/Toronto", "America/Winnipeg"], // north-west Ontario
};

const AREA = new Map<string, string[]>();
for (const [zone, codes] of Object.entries(BY_ZONE)) for (const c of codes.split(/\s+/)) if (c) AREA.set(c, [zone]);
for (const [c, zones] of Object.entries(SPLIT)) AREA.set(c, zones);

/** The zones of a +1 number's area code, or undefined when the code isn't known (or it isn't +1). */
export function nanpZones(e164: string): string[] | undefined {
  const m = /^\+1(\d{3})\d{7}$/.exec(e164);
  return m ? AREA.get(m[1]!) : undefined;
}
