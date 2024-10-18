#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const RESOLUTIONS = [
    {breite: 360, hoehe: 960, name: 'xs'},
    {breite: 601, hoehe: 960, name: 'sm'},
    {breite: 901, hoehe: 960, name: 'md'},
    {breite: 1201, hoehe: 960, name: 'lg'},
    {breite: 1537, hoehe: 960, name: 'xl'},
];

let waitTime = 3000;

function wait(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

function getDateFormatted() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function printUsageAndExit() {
    console.log('Usage: shoot <url> [output path] [--number-elements] [--adapter-config] \nIf no path is specified, the screenshots are saved in the current path.');
    process.exit(1);
}

async function prepareOutputPath(outputPath) {
    if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
        console.log(`Output path created: ${outputPath}`);
    }
}

async function labelElements(page, adapterConfig) {
    await page.evaluate((adapterConfig) => {
        // Alte Labels entfernen
        document.querySelectorAll('.element-number-label').forEach((label) => label.remove());

        // CSS-Stil für Labels hinzufügen
        const style = document.createElement('style');
        style.textContent = `
            .element-number-label {
              position: absolute;
              background-color: rgba(255, 0, 0, 1);
              color: #fff;
              font-size: 14px;
              font-weight: 800;
              padding: 2px 4px;
              border-radius: 4px;
              z-index: 9999;
              pointer-events: none;
            }
          `;
        document.head.appendChild(style);

        // Selektor für interaktive Elemente
        const interactiveSelector = `
            a[href],
            button,
            input,
            select,
            textarea,
            [contenteditable],
            [tabindex]:not([tabindex="-1"]),
            [role="button"],
            [role="link"],
            [role="checkbox"],
            [role="switch"],
            [onclick],
            [onmousedown],
            [onmouseup],
            [onmouseover],
            [onfocus],
            [onkeydown],
            [onkeyup],
            [onkeypress],
            .MuiCheckbox-root
          `;

        let elements = Array.from(document.querySelectorAll(interactiveSelector)).filter((el) => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return (
                rect.width > 0 &&
                rect.height > 0 &&
                style.visibility !== 'hidden' &&
                style.display !== 'none'
            );
        });

        if (adapterConfig) {
            const appPaper = document.getElementById('app-paper');
            if (appPaper) {
                let allElements = Array.from(appPaper.querySelectorAll('*'));
                const headers = appPaper.getElementsByTagName('header');
                if (headers.length > 0) {
                    const firstHeader = headers[0];
                    const headerElements = [firstHeader, ...firstHeader.querySelectorAll('*')];
                    allElements = allElements.filter(el => !headerElements.includes(el));
                }
                elements = allElements.filter(el => {
                    if (!el.matches(interactiveSelector)) {
                        return false;
                    }
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);
                    return (
                        rect.width > 0 &&
                        rect.height > 0 &&
                        style.visibility !== 'hidden' &&
                        style.display !== 'none'
                    );
                });
            }
        }

        elements.forEach((el, index) => {
            const rect = el.getBoundingClientRect();
            const label = document.createElement('div');
            label.classList.add('element-number-label');
            label.textContent = index + 1;
            label.style.left = `${window.scrollX + rect.left}px`;
            label.style.top = `${window.scrollY + rect.top}px`;
            document.body.appendChild(label);
        });
    }, adapterConfig);
}

(async () => {
    const args = process.argv.slice(2);

    if (!args.length) {
        printUsageAndExit();
    }

    const url = args[0];
    let outputPath = '.';
    let flags = [];

// Startindex für die Argumente nach der URL
    let i = 1;

// Prüfen, ob das nächste Argument ein Pfad oder ein Flag ist
    if (i < args.length && !args[i].startsWith('--')) {
        outputPath = args[i];
        i++;
    }

// Alle verbleibenden Argumente sind Flags
    for (; i < args.length; i++) {
        flags.push(args[i]);
    }

    const numberElements = flags.includes('--number-elements');
    const adapterConfig  = flags.includes('--adapter-config');

    if (!url) printUsageAndExit();

    await prepareOutputPath(outputPath);

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const dateFormatted = getDateFormatted();

    for (let res of RESOLUTIONS) {
        await page.setViewport({width: res.breite, height: res.hoehe});
        await page.goto(url, {waitUntil: 'networkidle2'});

        await wait(waitTime);

        if (adapterConfig) {
            // Tabs innerhalb von #app-paper finden
            const tabs = await page.$$(`#app-paper .MuiTab-root`); // Passen Sie den Selektor an Ihre Seite an
            console.log(`Anzahl Tabs: ${tabs.length}`);
            if (tabs.length > 0) {
                // Für jeden Tab einen Screenshot erstellen
                for (let i = 0; i < tabs.length; i++) {
                    // Tab anklicken
                    await tabs[i].click();

                    // Warten, bis der Inhalt des Tabs geladen ist
                    // Hier könnten Sie auf ein spezifisches Element innerhalb des Tabs warten
                    // await page.waitForSelector('#specific-element', {timeout: 10000});

                    // Alternativ eine feste Wartezeit verwenden
                    await wait(1000);

                    if (numberElements) {
                        await labelElements(page, adapterConfig);
                    }

                    const fileName = `${res.name}_${dateFormatted}_tab${i + 1}.png`;
                    const fullPath = path.join(outputPath, fileName);
                    await page.screenshot({path: fullPath});
                    console.log(`Screenshot erstellt: ${fullPath}`);
                }
            } else {
                console.log('Keine Tabs innerhalb von #app-paper gefunden.');

                if (numberElements) {
                    await labelElements(page, adapterConfig);
                }

                const fileName = `${res.name}_${dateFormatted}.png`;
                const fullPath = path.join(outputPath, fileName);
                await page.screenshot({path: fullPath});
                console.log(`Screenshot erstellt: ${fullPath}`);
            }
        } else {
            // Ohne adapterConfig wie gewohnt fortfahren
            await wait(5000);

            if (numberElements) {
                await labelElements(page, adapterConfig);
            }

            const fileName = `${res.name}_${dateFormatted}.png`;
            const fullPath = path.join(outputPath, fileName);
            await page.screenshot({path: fullPath});
            console.log(`Screenshot erstellt: ${fullPath}`);
        }
    }

    await browser.close();
})();
