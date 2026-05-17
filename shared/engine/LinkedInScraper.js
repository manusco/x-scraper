// shared/engine/LinkedInScraper.js
import { BaseScraper } from './BaseScraper.js';

export class LinkedInScraper extends BaseScraper {
    getContext() {
        let isArchiveMode = false;
        let mainId = null;

        if (typeof window !== 'undefined' && window.location) {
            // LinkedIn doesn't have a clear "bookmarks" mode like X in the same way, 
            // but we can detect "saved posts" page if needed.
            isArchiveMode = window.location.pathname.includes('/my-items/saved-posts/');
            
            // Extract activity ID from URL
            const activityMatch = window.location.pathname.match(/activity:(\d+)/);
            if (activityMatch) mainId = activityMatch[1];
        }
        return { isArchiveMode, mainId };
    }

    async waitForHydration() {
        let hydrationRetries = 0;
        while (document.querySelectorAll('.feed-shared-update-v2, .comments-comment-item').length === 0 && hydrationRetries < 5) {
            this.log('Waiting for LinkedIn DOM to hydrate...');
            this.emitProgress('Waiting for page to load...');
            await this.sleep(1500);
            hydrationRetries++;
        }
    }

    async expandContent() {
        // LinkedIn "See more" buttons in posts
        const seeMoreButtons = document.querySelectorAll('.feed-shared-inline-show-more-text__button, .comments-comment-item__inline-show-more-text');
        for (const btn of seeMoreButtons) {
            if (this.getText(btn).toLowerCase().includes('see more')) {
                btn.click();
            }
        }

        // LinkedIn "Load more comments"
        const loadMoreComments = document.querySelectorAll('.comments-comments-list__load-more-comments-button');
        for (const btn of loadMoreComments) {
            btn.click();
        }

        if (seeMoreButtons.length > 0 || loadMoreComments.length > 0) {
            await this.sleep(this.config.EXPAND_WAIT_MS);
        }
    }

    getVisibleItems() {
        // On a specific post page, we want the main update and all comments
        return document.querySelectorAll('.feed-shared-update-v2, .comments-comment-item');
    }

    extractData(element) {
        try {
            const isComment = element.classList.contains('comments-comment-item');
            
            // Handle
            const authorEl = element.querySelector('.update-components-actor__name, .comments-post-meta__name-text');
            const handle = authorEl ? this.getText(authorEl).trim() : '@unknown';

            // Text
            const textEl = element.querySelector('.feed-shared-update-v2__description, .comments-comment-item__main-content');
            let text = textEl ? this.getText(textEl).trim() : '';

            // Timestamp
            const timeEl = element.querySelector('.update-components-actor__sub-description, .comments-comment-item__timestamp');
            const timestamp = timeEl ? this.getText(timeEl).trim() : 'Recent';

            // ID
            let id = element.getAttribute('data-id') || 'li_' + Math.random().toString(36).substr(2, 9);
            
            // Metrics
            let metrics = { likes: 0, shares: 0, comments: 0 };
            const socialCounts = element.querySelector('.social-details-social-counts__item');
            if (socialCounts) {
                const countText = this.getText(socialCounts).toLowerCase();
                const numMatch = countText.match(/(\d+)/);
                if (numMatch) {
                    if (countText.includes('like')) metrics.likes = parseInt(numMatch[1]);
                    if (countText.includes('comment')) metrics.comments = parseInt(numMatch[1]);
                }
            }

            // Media
            const images = element.querySelectorAll('img.update-components-image__image');
            images.forEach((img, i) => {
                const alt = img.getAttribute('alt') || 'LinkedIn Attachment';
                text += `\n[Media ${i + 1}: ${alt}]`;
            });

            return {
                id,
                handle,
                timestamp,
                text,
                isMain: id.includes(this.mainId) || (!isComment && !this.mainId), // Fallback
                replyingTo: isComment ? [this.mainId].filter(Boolean) : [],
                metrics
            };
        } catch (e) {
            this.log('Error extracting LinkedIn data: ' + e.message);
            return null;
        }
    }
}
