"use strict";
// Bundled compatibility shim for environments where discord-api-types omits payloads/v10/message.js.
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageSearchSortMode = exports.MessageSearchEmbedType = exports.MessageSearchHasType = exports.MessageSearchAuthorType = exports.SeparatorSpacingSize = exports.UnfurledMediaItemLoadingState = exports.SelectMenuDefaultValueType = exports.TextInputStyle = exports.ButtonStyle = exports.ComponentType = exports.AllowedMentionsTypes = exports.AttachmentFlags = exports.EmbedType = exports.BaseThemeType = exports.MessageFlags = exports.MessageReferenceType = exports.MessageActivityType = exports.MessageType = void 0;
var MessageType;
(function (MessageType) {
    MessageType[MessageType["Default"] = 0] = "Default";
    MessageType[MessageType["RecipientAdd"] = 1] = "RecipientAdd";
    MessageType[MessageType["RecipientRemove"] = 2] = "RecipientRemove";
    MessageType[MessageType["Call"] = 3] = "Call";
    MessageType[MessageType["ChannelNameChange"] = 4] = "ChannelNameChange";
    MessageType[MessageType["ChannelIconChange"] = 5] = "ChannelIconChange";
    MessageType[MessageType["ChannelPinnedMessage"] = 6] = "ChannelPinnedMessage";
    MessageType[MessageType["UserJoin"] = 7] = "UserJoin";
    MessageType[MessageType["GuildBoost"] = 8] = "GuildBoost";
    MessageType[MessageType["GuildBoostTier1"] = 9] = "GuildBoostTier1";
    MessageType[MessageType["GuildBoostTier2"] = 10] = "GuildBoostTier2";
    MessageType[MessageType["GuildBoostTier3"] = 11] = "GuildBoostTier3";
    MessageType[MessageType["ChannelFollowAdd"] = 12] = "ChannelFollowAdd";
    MessageType[MessageType["GuildDiscoveryDisqualified"] = 14] = "GuildDiscoveryDisqualified";
    MessageType[MessageType["GuildDiscoveryRequalified"] = 15] = "GuildDiscoveryRequalified";
    MessageType[MessageType["GuildDiscoveryGracePeriodInitialWarning"] = 16] = "GuildDiscoveryGracePeriodInitialWarning";
    MessageType[MessageType["GuildDiscoveryGracePeriodFinalWarning"] = 17] = "GuildDiscoveryGracePeriodFinalWarning";
    MessageType[MessageType["ThreadCreated"] = 18] = "ThreadCreated";
    MessageType[MessageType["Reply"] = 19] = "Reply";
    MessageType[MessageType["ChatInputCommand"] = 20] = "ChatInputCommand";
    MessageType[MessageType["ThreadStarterMessage"] = 21] = "ThreadStarterMessage";
    MessageType[MessageType["GuildInviteReminder"] = 22] = "GuildInviteReminder";
    MessageType[MessageType["ContextMenuCommand"] = 23] = "ContextMenuCommand";
    MessageType[MessageType["AutoModerationAction"] = 24] = "AutoModerationAction";
    MessageType[MessageType["RoleSubscriptionPurchase"] = 25] = "RoleSubscriptionPurchase";
    MessageType[MessageType["InteractionPremiumUpsell"] = 26] = "InteractionPremiumUpsell";
    MessageType[MessageType["StageStart"] = 27] = "StageStart";
    MessageType[MessageType["StageEnd"] = 28] = "StageEnd";
    MessageType[MessageType["StageSpeaker"] = 29] = "StageSpeaker";
    MessageType[MessageType["StageRaiseHand"] = 30] = "StageRaiseHand";
    MessageType[MessageType["StageTopic"] = 31] = "StageTopic";
    MessageType[MessageType["GuildApplicationPremiumSubscription"] = 32] = "GuildApplicationPremiumSubscription";
    MessageType[MessageType["GuildIncidentAlertModeEnabled"] = 36] = "GuildIncidentAlertModeEnabled";
    MessageType[MessageType["GuildIncidentAlertModeDisabled"] = 37] = "GuildIncidentAlertModeDisabled";
    MessageType[MessageType["GuildIncidentReportRaid"] = 38] = "GuildIncidentReportRaid";
    MessageType[MessageType["GuildIncidentReportFalseAlarm"] = 39] = "GuildIncidentReportFalseAlarm";
    MessageType[MessageType["PurchaseNotification"] = 44] = "PurchaseNotification";
    MessageType[MessageType["PollResult"] = 46] = "PollResult";
})(MessageType || (exports.MessageType = MessageType = {}));
var MessageActivityType;
(function (MessageActivityType) {
    MessageActivityType[MessageActivityType["Join"] = 1] = "Join";
    MessageActivityType[MessageActivityType["Spectate"] = 2] = "Spectate";
    MessageActivityType[MessageActivityType["Listen"] = 3] = "Listen";
    MessageActivityType[MessageActivityType["JoinRequest"] = 5] = "JoinRequest";
})(MessageActivityType || (exports.MessageActivityType = MessageActivityType = {}));
var MessageReferenceType;
(function (MessageReferenceType) {
    MessageReferenceType[MessageReferenceType["Default"] = 0] = "Default";
    MessageReferenceType[MessageReferenceType["Forward"] = 1] = "Forward";
})(MessageReferenceType || (exports.MessageReferenceType = MessageReferenceType = {}));
var MessageFlags;
(function (MessageFlags) {
    MessageFlags[MessageFlags["Crossposted"] = 1] = "Crossposted";
    MessageFlags[MessageFlags["IsCrosspost"] = 2] = "IsCrosspost";
    MessageFlags[MessageFlags["SuppressEmbeds"] = 4] = "SuppressEmbeds";
    MessageFlags[MessageFlags["SourceMessageDeleted"] = 8] = "SourceMessageDeleted";
    MessageFlags[MessageFlags["Urgent"] = 16] = "Urgent";
    MessageFlags[MessageFlags["HasThread"] = 32] = "HasThread";
    MessageFlags[MessageFlags["Ephemeral"] = 64] = "Ephemeral";
    MessageFlags[MessageFlags["Loading"] = 128] = "Loading";
    MessageFlags[MessageFlags["FailedToMentionSomeRolesInThread"] = 256] = "FailedToMentionSomeRolesInThread";
    MessageFlags[MessageFlags["ShouldShowLinkNotDiscordWarning"] = 1024] = "ShouldShowLinkNotDiscordWarning";
    MessageFlags[MessageFlags["SuppressNotifications"] = 4096] = "SuppressNotifications";
    MessageFlags[MessageFlags["IsVoiceMessage"] = 8192] = "IsVoiceMessage";
    MessageFlags[MessageFlags["HasSnapshot"] = 16384] = "HasSnapshot";
    MessageFlags[MessageFlags["IsComponentsV2"] = 32768] = "IsComponentsV2";
})(MessageFlags || (exports.MessageFlags = MessageFlags = {}));
var BaseThemeType;
(function (BaseThemeType) {
    BaseThemeType[BaseThemeType["Unset"] = 0] = "Unset";
    BaseThemeType[BaseThemeType["Dark"] = 1] = "Dark";
    BaseThemeType[BaseThemeType["Light"] = 2] = "Light";
    BaseThemeType[BaseThemeType["Darker"] = 3] = "Darker";
    BaseThemeType[BaseThemeType["Midnight"] = 4] = "Midnight";
})(BaseThemeType || (exports.BaseThemeType = BaseThemeType = {}));
var EmbedType;
(function (EmbedType) {
    EmbedType["Rich"] = "rich";
    EmbedType["Image"] = "image";
    EmbedType["Video"] = "video";
    EmbedType["GIFV"] = "gifv";
    EmbedType["Article"] = "article";
    EmbedType["Link"] = "link";
    EmbedType["AutoModerationMessage"] = "auto_moderation_message";
    EmbedType["PollResult"] = "poll_result";
})(EmbedType || (exports.EmbedType = EmbedType = {}));
var AttachmentFlags;
(function (AttachmentFlags) {
    AttachmentFlags[AttachmentFlags["IsRemix"] = 4] = "IsRemix";
})(AttachmentFlags || (exports.AttachmentFlags = AttachmentFlags = {}));
var AllowedMentionsTypes;
(function (AllowedMentionsTypes) {
    AllowedMentionsTypes["Everyone"] = "everyone";
    AllowedMentionsTypes["Role"] = "roles";
    AllowedMentionsTypes["User"] = "users";
})(AllowedMentionsTypes || (exports.AllowedMentionsTypes = AllowedMentionsTypes = {}));
var ComponentType;
(function (ComponentType) {
    ComponentType[ComponentType["ActionRow"] = 1] = "ActionRow";
    ComponentType[ComponentType["Button"] = 2] = "Button";
    ComponentType[ComponentType["StringSelect"] = 3] = "StringSelect";
    ComponentType[ComponentType["TextInput"] = 4] = "TextInput";
    ComponentType[ComponentType["UserSelect"] = 5] = "UserSelect";
    ComponentType[ComponentType["RoleSelect"] = 6] = "RoleSelect";
    ComponentType[ComponentType["MentionableSelect"] = 7] = "MentionableSelect";
    ComponentType[ComponentType["ChannelSelect"] = 8] = "ChannelSelect";
    ComponentType[ComponentType["Section"] = 9] = "Section";
    ComponentType[ComponentType["TextDisplay"] = 10] = "TextDisplay";
    ComponentType[ComponentType["Thumbnail"] = 11] = "Thumbnail";
    ComponentType[ComponentType["MediaGallery"] = 12] = "MediaGallery";
    ComponentType[ComponentType["File"] = 13] = "File";
    ComponentType[ComponentType["Separator"] = 14] = "Separator";
    ComponentType[ComponentType["Container"] = 17] = "Container";
})(ComponentType || (exports.ComponentType = ComponentType = {}));
var ButtonStyle;
(function (ButtonStyle) {
    ButtonStyle[ButtonStyle["Primary"] = 1] = "Primary";
    ButtonStyle[ButtonStyle["Secondary"] = 2] = "Secondary";
    ButtonStyle[ButtonStyle["Success"] = 3] = "Success";
    ButtonStyle[ButtonStyle["Danger"] = 4] = "Danger";
    ButtonStyle[ButtonStyle["Link"] = 5] = "Link";
    ButtonStyle[ButtonStyle["Premium"] = 6] = "Premium";
})(ButtonStyle || (exports.ButtonStyle = ButtonStyle = {}));
var TextInputStyle;
(function (TextInputStyle) {
    TextInputStyle[TextInputStyle["Short"] = 1] = "Short";
    TextInputStyle[TextInputStyle["Paragraph"] = 2] = "Paragraph";
})(TextInputStyle || (exports.TextInputStyle = TextInputStyle = {}));
var SelectMenuDefaultValueType;
(function (SelectMenuDefaultValueType) {
    SelectMenuDefaultValueType["User"] = "user";
    SelectMenuDefaultValueType["Role"] = "role";
    SelectMenuDefaultValueType["Channel"] = "channel";
})(SelectMenuDefaultValueType || (exports.SelectMenuDefaultValueType = SelectMenuDefaultValueType = {}));
var UnfurledMediaItemLoadingState;
(function (UnfurledMediaItemLoadingState) {
    UnfurledMediaItemLoadingState[UnfurledMediaItemLoadingState["Unknown"] = 0] = "Unknown";
    UnfurledMediaItemLoadingState[UnfurledMediaItemLoadingState["Loading"] = 1] = "Loading";
    UnfurledMediaItemLoadingState[UnfurledMediaItemLoadingState["LoadedSuccess"] = 2] = "LoadedSuccess";
    UnfurledMediaItemLoadingState[UnfurledMediaItemLoadingState["LoadedNotFound"] = 3] = "LoadedNotFound";
})(UnfurledMediaItemLoadingState || (exports.UnfurledMediaItemLoadingState = UnfurledMediaItemLoadingState = {}));
var SeparatorSpacingSize;
(function (SeparatorSpacingSize) {
    SeparatorSpacingSize[SeparatorSpacingSize["Small"] = 1] = "Small";
    SeparatorSpacingSize[SeparatorSpacingSize["Large"] = 2] = "Large";
})(SeparatorSpacingSize || (exports.SeparatorSpacingSize = SeparatorSpacingSize = {}));
var MessageSearchAuthorType;
(function (MessageSearchAuthorType) {
    MessageSearchAuthorType["OnlyUser"] = "user";
    MessageSearchAuthorType["OnlyBot"] = "bot";
})(MessageSearchAuthorType || (exports.MessageSearchAuthorType = MessageSearchAuthorType = {}));
var MessageSearchHasType;
(function (MessageSearchHasType) {
    MessageSearchHasType["Link"] = "link";
    MessageSearchHasType["Embed"] = "embed";
    MessageSearchHasType["File"] = "file";
    MessageSearchHasType["Video"] = "video";
    MessageSearchHasType["Image"] = "image";
    MessageSearchHasType["Sound"] = "sound";
    MessageSearchHasType["Sticker"] = "sticker";
    MessageSearchHasType["Gif"] = "gif";
    MessageSearchHasType["Poll"] = "poll";
    MessageSearchHasType["Snapshot"] = "snapshot";
})(MessageSearchHasType || (exports.MessageSearchHasType = MessageSearchHasType = {}));
var MessageSearchEmbedType;
(function (MessageSearchEmbedType) {
    MessageSearchEmbedType["Image"] = "image";
    MessageSearchEmbedType["Video"] = "video";
    MessageSearchEmbedType["Gifv"] = "gifv";
    MessageSearchEmbedType["Article"] = "article";
    MessageSearchEmbedType["Link"] = "link";
    MessageSearchEmbedType["AutoModerationMessage"] = "auto_moderation_message";
    MessageSearchEmbedType["PollResult"] = "poll_result";
})(MessageSearchEmbedType || (exports.MessageSearchEmbedType = MessageSearchEmbedType = {}));
var MessageSearchSortMode;
(function (MessageSearchSortMode) {
    MessageSearchSortMode["Relevance"] = "relevance";
    MessageSearchSortMode["Latest"] = "latest";
})(MessageSearchSortMode || (exports.MessageSearchSortMode = MessageSearchSortMode = {}));
