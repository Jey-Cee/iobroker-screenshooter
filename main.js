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

        // Gesamthöhe der Seite ermitteln
        const bodyHandle = await page.$('body');
        const { scrollHeight } = await bodyHandle.evaluate(body => ({ scrollHeight: body.scrollHeight }));
        await bodyHandle.dispose();

        const viewportHeight = res.hoehe;
        let scrollSteps = Math.ceil(scrollHeight / viewportHeight);


        if (adapterConfig) {
            // Tabs innerhalb von #app-paper finden
            const tabs = await page.$$(`#app-paper .MuiTab-root`); // Passen Sie den Selektor an Ihre Seite an
            // console.log(`Anzahl Tabs: ${tabs.length}`);
            if (tabs.length > 0) {
                // Für jeden Tab einen Screenshot erstellen
                for (let i = 0; i < tabs.length; i++) {
                    // Schwebenden Button ausblenden
                    await page.evaluate(() => {
                        const floatingButton = document.querySelectorAll('.MuiFab-root'); // Passen Sie den Selektor an
                        if (floatingButton) {
                            for (let fb of floatingButton) {
                                fb.style.display = 'none';
                            }

                        }
                    });
                    // Tab anklicken
                    await tabs[i].click();

                    // Schwebenden Button wieder einblenden
                    await page.evaluate(() => {
                        const floatingButton = document.querySelectorAll('.MuiFab-root'); // Passen Sie den Selektor an
                        for (let fb of floatingButton) {
                            fb.style.display = '';
                        }
                    });

                    // Alternativ eine feste Wartezeit verwenden
                    await wait(1000);

                    if (numberElements) {
                        await labelElements(page, adapterConfig);
                    }

                    // Scrollbares Div finden
                    const scrollableDivSelector = await page.evaluate(() => {
                        // Alle Divs auf der Seite finden
                        const divs = Array.from(document.querySelectorAll('div'));
                        // Div finden, das scrollable ist
                        const scrollableDiv = divs.find(div => {
                            const style = window.getComputedStyle(div);
                            const overflowY = style.overflowY;
                            const scrollHeight = div.scrollHeight;
                            const clientHeight = div.clientHeight;
                            return (
                                (overflowY === 'auto' || overflowY === 'scroll') &&
                                scrollHeight > clientHeight
                            );
                        });
                        if (scrollableDiv) {
                            // Erstellen Sie einen eindeutigen Selektor
                            scrollableDiv.setAttribute('data-scrollable-div', 'true');
                            return '[data-scrollable-div="true"]';
                        }
                        return null;
                    });

                    if (!scrollableDivSelector) {
                        console.error('Kein scrollbares Div gefunden.');
                        continue;
                    }

                    // Gesamthöhe der Seite ermitteln
                    const totalHeight = await page.evaluate(() => {
                        return document.documentElement.scrollHeight;
                    });

                    let viewportHeight = res.hoehe;
                    let scrollY = 0;
                    let part = 1;


                    while (scrollY < totalHeight) {
                        await page.evaluate((selector, _scrollY) => {
                            const div = document.querySelector(selector);
                            div.scrollTo(0, _scrollY);
                        }, scrollableDivSelector, scrollY);

                        await wait(500);

                        const fileName = `${res.name}_${dateFormatted}_tab${i + 1}_part${part}.png`;
                        const fullPath = path.join(outputPath, fileName);

                        try {
                            await page.screenshot({ path: fullPath });
                            console.log(`Screenshot erstellt: ${fullPath}`);
                        } catch (error) {
                            console.error(`Fehler beim Erstellen des Screenshots: ${error}`);
                        }

                        scrollY += viewportHeight;
                        part++;
                    }

                    // Zurück zum Anfang des Divs scrollen
                    await page.evaluate((selector) => {
                        const div = document.querySelector(selector);
                        div.scrollTo(0, 0);
                        // Attribut entfernen
                        div.removeAttribute('data-scrollable-div');
                    }, scrollableDivSelector);

                }
            } else {
                console.log('Keine Tabs innerhalb von #app-paper gefunden.');

                if (numberElements) {
                    await labelElements(page, adapterConfig);
                }

                // Gesamthöhe der Seite ermitteln
                const totalHeight = await page.evaluate(() => {
                    return document.body.scrollHeight;
                });

                let viewportHeight = res.hoehe;
                let scrollY = 0;
                let part = 1;

                while (scrollY < totalHeight) {
                    await page.evaluate((_scrollY) => {
                        window.scrollTo(0, _scrollY);
                    }, scrollY);

                    await wait(500);

                    const fileName = `${res.name}_${dateFormatted}_part${part}.png`;
                    const fullPath = path.join(outputPath, fileName);

                    // Berechnen der tatsächlichen Höhe für den Screenshot
                    let clipHeight = viewportHeight;
                    if (scrollY + viewportHeight > totalHeight) {
                        clipHeight = totalHeight - scrollY;
                    }

                    await page.screenshot({
                        path: fullPath,
                        clip: {
                            x: 0,
                            y: 0,
                            width: res.breite,
                            height: clipHeight,
                        },
                    });
                    console.log(`Screenshot erstellt: ${fullPath}`);

                    scrollY += viewportHeight;
                    part++;
                }

                // Zurück zum Anfang der Seite scrollen
                await page.evaluate(() => {
                    window.scrollTo(0, 0);
                });
            }
        } else {
            // Ohne adapterConfig wie gewohnt fortfahren
            await wait(5000);

            if (numberElements) {
                await labelElements(page, adapterConfig);
            }

            // Gesamthöhe der Seite ermitteln
            const totalHeight = await page.evaluate(() => {
                return document.body.scrollHeight;
            });

            let viewportHeight = res.hoehe;
            let scrollY = 0;
            let part = 1;

            while (scrollY < totalHeight) {
                await page.evaluate((_scrollY) => {
                    window.scrollTo(0, _scrollY);
                }, scrollY);

                await wait(500);

                const fileName = `${res.name}_${dateFormatted}_part${part}.png`;
                const fullPath = path.join(outputPath, fileName);

                // Berechnen der tatsächlichen Höhe für den Screenshot
                let clipHeight = viewportHeight;
                if (scrollY + viewportHeight > totalHeight) {
                    clipHeight = totalHeight - scrollY;
                }

                await page.screenshot({
                    path: fullPath,
                    clip: {
                        x: 0,
                        y: 0,
                        width: res.breite,
                        height: clipHeight
                    }
                });
                console.log(`Screenshot erstellt: ${fullPath}`);

                scrollY += viewportHeight;
                part++;
            }

                // Zurück zum Anfang der Seite scrollen
                await page.evaluate(() => {
                    window.scrollTo(0, 0);
                });
            }
    }

    await browser.close();
})();
