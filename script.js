const contactItems = [
    ["QQ：剪云舞影月华悠", "2924832727"],
    ["原神：剪云舞影月华悠", "307126423"],
    ["崩铁：我自己都不知道", "怎么告诉你啊"],
    ["邮箱：剪云舞影月华悠", "2924832727@qq.com"],
    ["GitHub：JYWYYHY", "https://github.com/JYWYYHY/"]
];

const contactLabel = document.getElementById("contact-label");
const contactValue = document.getElementById("contact-value");
const contactDetails = document.getElementById("contact-details");
const copyButton = document.getElementById("copy-button");
const copyToast = document.getElementById("copy-toast");
const profileShowcase = document.querySelector(".profile-showcase");
const wideLayout = window.matchMedia("(min-width: 55rem)");
let currentContact = 0;

function showContact(index) {
    currentContact = index;
    contactLabel.textContent = contactItems[index][0];
    contactValue.textContent = contactItems[index][1];
}

function switchContact(index) {
    contactDetails.classList.remove("is-entering");
    contactDetails.classList.add("is-leaving");
    setTimeout(() => {
        showContact(index);
        contactDetails.classList.remove("is-leaving");
        contactDetails.classList.add("is-entering");
        setTimeout(() => contactDetails.classList.remove("is-entering"), 450);
    }, 300);
}

function copyText(text) {
    if (navigator.clipboard) {
        return navigator.clipboard.writeText(text);
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    return Promise.resolve();
}

copyButton.addEventListener("click", () => {
    const copiedText = contactItems[currentContact][1];
    copyText(copiedText).then(() => {
        copyToast.textContent = `复制成功喵~：“${copiedText}”`;
        copyToast.classList.add("is-visible");
        clearTimeout(copyToast.hideTimer);
        copyToast.hideTimer = setTimeout(() => {
            copyToast.classList.remove("is-visible");
        }, 3000);
    });
});

showContact(0);
if (wideLayout.matches) {
    setTimeout(() => profileShowcase.classList.add("is-ready"), 80);
}
setInterval(() => {
    switchContact((currentContact + 1) % contactItems.length);
}, 3000);