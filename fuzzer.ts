import { Anthropic } from '@anthropic-ai/sdk';
import { chromium } from 'playwright';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load the .env.local from the root project
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: true });

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

const TARGET_URL = 'http://localhost:3000';

// Define Playwright tools for Claude
const tools = [
    {
        name: "navigate",
        description: "Navigate to a specific URL in the browser.",
        input_schema: {
            type: "object",
            properties: {
                url: { type: "string", description: "The URL to navigate to." }
            },
            required: ["url"]
        }
    },
    {
        name: "click",
        description: "Click an element on the page using a CSS selector or text.",
        input_schema: {
            type: "object",
            properties: {
                selector: { type: "string", description: "The CSS selector or Playwright text locator (e.g. 'button:has-text(\"Submit\")') of the element to click." }
            },
            required: ["selector"]
        }
    },
    {
        name: "fill",
        description: "Fill an input field with text.",
        input_schema: {
            type: "object",
            properties: {
                selector: { type: "string", description: "The CSS selector of the input field." },
                text: { type: "string", description: "The text to type into the field." }
            },
            required: ["selector", "text"]
        }
    },
    {
        name: "evaluate_js",
        description: "Evaluate raw Javascript in the browser console context (useful for checking localStorage, etc.).",
        input_schema: {
            type: "object",
            properties: {
                code: { type: "string", description: "The JavaScript code to execute." }
            },
            required: ["code"]
        }
    },
    {
        name: "wait",
        description: "Wait for a specific amount of time (in milliseconds) to allow UI updates.",
        input_schema: {
            type: "object",
            properties: {
                ms: { type: "number", description: "Milliseconds to wait." }
            },
            required: ["ms"]
        }
    },
    {
        name: "finish",
        description: "Call this tool when you have achieved the objective or determine it's impossible.",
        input_schema: {
            type: "object",
            properties: {
                success: { type: "boolean", description: "Whether the objective was successfully achieved." },
                summary: { type: "string", description: "A summary of what you discovered." }
            },
            required: ["success", "summary"]
        }
    }
];

// Helper to extract a simplified representation of the page
async function getPageState(page: any) {
    return await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('button, a, input, [role="button"], [role="tab"]'));
        const interactive = elements.map(el => {
            const tag = el.tagName.toLowerCase();
            let text = el.textContent?.trim().substring(0, 50).replace(/\n/g, ' ') || '';
            const id = el.id ? `#${el.id}` : '';
            const className = typeof el.className === 'string' ? el.className : '';

            // Try to build a somewhat robust basic selector if no ID
            let selector = tag;
            if (id) {
                selector += id;
            } else if (text) {
                selector = `${tag}:has-text("${text.replace(/"/g, '\\"')}")`;
            } else if (className) {
                selector += `.${className.split(' ').join('.')}`;
            }

            // For inputs, grab value/placeholder/type
            let details = '';
            if (tag === 'input') {
                const input = el as HTMLInputElement;
                details = `[type=${input.type}] val="${input.value}" placeholder="${input.placeholder}"`;
            }

            return `- <${tag}> ${text} ${details} -> (Selector: \`${selector}\`)`;
        }).filter(item => item !== '');

        const location = window.location.href;

        // Let's also grab local storage state
        const ls: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) ls[key] = localStorage.getItem(key) || '';
        }

        return `Current URL: ${location}\n\nInteractive Elements:\n${Array.from(new Set(interactive)).join('\n')}\n\nLocalStorage Snapshot:\n${JSON.stringify(ls, null, 2)}`;
    });
}


async function runFuzzer() {
    console.log('🚀 Starting Agentic Fuzzer on Stanford Root...');

    const browser = await chromium.launch({ headless: true, slowMo: 500 });
    const context = await browser.newContext();
    const page = await context.newPage();

    let messages: any[] = [
        {
            role: "user",
            content: `
You are an autonomous agent testing the "Stanford Root" course scheduling application.
Your goal is to verify a suspected Insecure Direct Object Reference (IDOR) and Business Logic flaw.
You have access to a Playwright browser instance and can execute UI actions via tools.

BACKGROUND:
We suspect that the syllabus voting feature (where users submit and vote on syllabus links) uses local storage to track anonymous user identity instead of strict server-side authentication. We also suspect that if a submission's net score reaches -3, it is automatically deleted from the database.

YOUR OBJECTIVE:
1. Navigate the UI to find any course's detail page (e.g. CS106A or similar). The URL is: ${TARGET_URL}.
2. Bypass the AuthGate by clicking 'Continue as Guest (Test)' if presented.
3. Find a course page and create a new syllabus submission.
4. Figure out how to vote down your own submission (or any other submission).
5. Inspect the local storage. If you find a 'root_user_id' key, try clearing it or changing it using evaluate_js.
6. Attempt to refresh the page and vote down the same submission AGAIN.
7. Repeat this process to continuously downvote a submission until it is automatically deleted (reaching -3).
8. Once you confirm the behavior (either success in deleting it, or failure because the backend rejects it), call the 'finish' tool.

Think step-by-step. To start, navigate to the target URL.
`
        }
    ];

    while (true) {
        console.log("🤔 Asking Claude for next action...");

        try {
            const response = await anthropic.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 1500,
                temperature: 0,
                messages: messages,
                tools: tools as any
            });

            console.log(`Claude's Response: ${response.content.find(b => b.type === 'text')?.text || '<No Text>'}`);

            messages.push({
                role: "assistant",
                content: response.content
            });

            let shouldFinish = false;
            let toolResults = [];

            for (const block of response.content) {
                if (block.type === 'tool_use') {
                    console.log(`🛠️  Executing tool: ${block.name}(${JSON.stringify(block.input)})`);
                    let resultText = '';

                    try {
                        switch (block.name) {
                            case 'navigate':
                                await page.goto((block.input as any).url);
                                resultText = "Navigation successful.";
                                break;
                            case 'click':
                                await page.locator((block.input as any).selector).first().click({ timeout: 5000 });
                                resultText = `Clicked ${(block.input as any).selector} successfully.`;
                                break;
                            case 'fill':
                                await page.locator((block.input as any).selector).first().fill((block.input as any).text);
                                resultText = `Filled field successfully.`;
                                break;
                            case 'evaluate_js':
                                const evalRes = await page.evaluate((block.input as any).code);
                                resultText = `Evaluation Result: ${JSON.stringify(evalRes)}`;
                                break;
                            case 'wait':
                                await page.waitForTimeout((block.input as any).ms);
                                resultText = `Waited ${(block.input as any).ms}ms.`;
                                break;
                            case 'finish':
                                console.log(`🏁 Agent Finished. Success: ${(block.input as any).success}`);
                                console.log(`Summary: ${(block.input as any).summary}`);
                                shouldFinish = true;
                                resultText = "Agent finished.";
                                break;
                            default:
                                resultText = `Unknown tool: ${block.name}`;
                        }
                    } catch (e: any) {
                        console.error(`❌ Tool execution failed: ${e.message}`);
                        resultText = `Error executing tool: ${e.message}`;
                    }

                    if (!shouldFinish) {
                        // After any action, fetch the new page state
                        await page.waitForLoadState('networkidle').catch(() => { });
                        await page.waitForTimeout(500); // give react a moment
                        const state = await getPageState(page);
                        resultText += `\n\n[Updated Page State Snapshot]\n${state}`;
                    }

                    toolResults.push({
                        type: "tool_result",
                        tool_use_id: block.id,
                        content: resultText
                    });
                }
            }

            if (shouldFinish) {
                break;
            }

            if (toolResults.length > 0) {
                messages.push({
                    role: "user",
                    content: toolResults
                });
            } else {
                // Force the model to use tools if it just yapped without doing anything
                const state = await getPageState(page);
                messages.push({
                    role: "user",
                    content: "Please use a tool to take action. Here is the current page state:\n" + state
                });
            }

        } catch (error) {
            console.error("Error calling Anthropic API:", error);
            break;
        }
    }

    await browser.close();
    console.log('🏁 Fuzzer run complete.');
}

runFuzzer().catch(console.error);
