const Joi = require('joi');

// Search request validation schema
const searchSchema = Joi.object({
  query: Joi.string().min(1).max(500).required().messages({
    'string.empty': 'Search query is required',
    'string.min': 'Search query must be at least 1 character',
    'string.max': 'Search query must be less than 500 characters'
  }),
  platforms: Joi.array().items(
    Joi.string().valid('reddit', 'x', 'youtube', 'linkedin', 'threads')
  ).min(1).required().messages({
    'array.min': 'At least one platform must be selected',
    'any.only': 'Platform must be one of: reddit, x, youtube, linkedin, threads'
  }),
  language: Joi.string().length(2).default('en').messages({
    'string.length': 'Language must be a 2-character code (e.g., en, es, fr)'
  }),
  timeFilter: Joi.string().valid('hour', 'day', 'week', 'month', '3months', '6months', 'year', 'all').default('week').messages({
    'any.only': 'Time filter must be one of: hour, day, week, month, 3months, 6months, year, all'
  })
});

// Reddit search validation schema
const redditSearchSchema = Joi.object({
  query: Joi.string().min(1).max(500).required(),
  language: Joi.string().length(2).default('en'),
  timeFilter: Joi.string().valid('hour', 'day', 'week', 'month', '3months', '6months', 'year', 'all').default('week')
});

// X search validation schema
const xSearchSchema = Joi.object({
  query: Joi.string().min(1).max(500).required(),
  language: Joi.string().length(2).default('en'),
  maxResults: Joi.number().integer().min(1).max(100).default(50)
});

const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { 
      abortEarly: false,
      stripUnknown: true 
    });
    
    if (error) {
      const errorMessages = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid request data',
        details: errorMessages
      });
    }
    
    req.body = value;
    next();
  };
};

module.exports = {
  validateSearchRequest: validateRequest(searchSchema),
  validateRedditSearchRequest: validateRequest(redditSearchSchema),
  validateXSearchRequest: validateRequest(xSearchSchema)
};
